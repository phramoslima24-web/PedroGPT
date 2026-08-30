
import os
from datetime import datetime

import psycopg2
import psycopg2.extras

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    session,
    redirect,
    url_for
)

from werkzeug.security import (
    generate_password_hash,
    check_password_hash
)

from groq import Groq


# ============================================================
# ORION AI - APP.PY
# ============================================================

app = Flask(__name__)


# ============================================================
# CONFIGURAÇÕES
# ============================================================

app.secret_key = os.getenv(
    "FLASK_SECRET_KEY",
    "orion_ai_secret_key"
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

ADMIN_USERNAME = os.getenv(
    "ADMIN_USERNAME",
    "admin"
).strip()

ADMIN_PASSWORD = os.getenv(
    "ADMIN_PASSWORD",
    ""
)

client = None

if GROQ_API_KEY:
    client = Groq(
        api_key=GROQ_API_KEY
    )


# ============================================================
# BANCO DE DADOS
# ============================================================

def get_db():

    if not DATABASE_URL:

        raise RuntimeError(
            "DATABASE_URL não está configurada no servidor."
        )

    return psycopg2.connect(
        DATABASE_URL,
        connect_timeout=10
    )


# ============================================================
# INICIALIZAR BANCO
# ============================================================

def init_db():

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                plan TEXT DEFAULT 'free'
            )
        """)

        cursor.execute("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free'
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                username TEXT,
                sender TEXT,
                message TEXT
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                title TEXT DEFAULT 'Nova conversa',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER NOT NULL,
                sender TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (conversation_id)
                REFERENCES conversations(id)
                ON DELETE CASCADE
            )
        """)

        conn.commit()


try:

    init_db()

    print(
        "BANCO DE DADOS INICIALIZADO COM SUCESSO."
    )

except Exception as e:

    print(
        "ERRO AO INICIALIZAR BANCO:",
        repr(e)
    )


# ============================================================
# VERSION
# ============================================================

@app.route("/version")
def version():

    return jsonify({

        "success":
            True,

        "version":
            "1.3",

        "apk_url":
            "https://drive.google.com/file/d/1mdpeCrIJNcU2DlHLabjgh17zvM2ha703/view?usp=drive_link"

    })


# ============================================================
# FUNÇÕES AUXILIARES
# ============================================================

def criar_conversa(
    username,
    titulo="Nova conversa"
):

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO conversations
            (username, title)
            VALUES (%s, %s)
            RETURNING id
        """, (
            username,
            titulo
        ))

        resultado = cursor.fetchone()

        if not resultado:

            raise RuntimeError(
                "Não foi possível criar a conversa."
            )

        conversation_id = resultado[0]

        conn.commit()

        return conversation_id


def verificar_conversa(
    username,
    conversation_id
):

    if not conversation_id:
        return False

    try:

        conversation_id = int(
            conversation_id
        )

    except (
        ValueError,
        TypeError
    ):

        return False

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
            SELECT id
            FROM conversations
            WHERE id = %s
            AND username = %s
        """, (
            conversation_id,
            username
        ))

        return cursor.fetchone() is not None


def conversa_atual():

    if "user" not in session:
        return None

    username = session["user"]

    conversation_id = session.get(
        "conversation_id"
    )

    if conversation_id:

        try:

            if verificar_conversa(
                username,
                conversation_id
            ):

                return int(
                    conversation_id
                )

        except Exception as e:

            print(
                "ERRO AO VERIFICAR CONVERSA:",
                repr(e)
            )

    conversation_id = criar_conversa(
        username,
        "Nova conversa"
    )

    session["conversation_id"] = (
        conversation_id
    )

    session.modified = True

    return conversation_id


def gerar_titulo(mensagem):

    titulo = (
        str(mensagem or "")
        .replace("\n", " ")
        .strip()
    )

    if not titulo:

        return "Nova conversa"

    if len(titulo) > 45:

        titulo = (
            titulo[:45]
            .rstrip()
            + "..."
        )

    return titulo


def atualizar_titulo_se_necessario(
    conversation_id,
    mensagem
):

    with get_db() as conn:

        cursor = conn.cursor(
            cursor_factory=psycopg2.extras.RealDictCursor
        )

        cursor.execute("""
            SELECT title
            FROM conversations
            WHERE id = %s
        """, (
            conversation_id,
        ))

        conversa = cursor.fetchone()

        if not conversa:
            return

        titulo_atual = (
            conversa["title"] or ""
        ).strip()

        if titulo_atual != "Nova conversa":
            return

        novo_titulo = gerar_titulo(
            mensagem
        )

        cursor.execute("""
            UPDATE conversations
            SET title = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (
            novo_titulo,
            conversation_id
        ))

        conn.commit()


def obter_plan_usuario(username):

    with get_db() as conn:

        cursor = conn.cursor(
            cursor_factory=psycopg2.extras.RealDictCursor
        )

        cursor.execute("""
            SELECT plan
            FROM users
            WHERE username = %s
        """, (
            username,
        ))

        usuario = cursor.fetchone()

        if not usuario:

            return "free"

        return (
            usuario["plan"]
            or "free"
        ).lower()


# ============================================================
# VERIFICAR ADMIN
# ============================================================

def verificar_admin():

    return (
        session.get("admin") is True
        and session.get("user") == ADMIN_USERNAME
    )


# ============================================================
# PÁGINAS
# ============================================================

@app.route("/")
def home():

    if "user" not in session:

        return redirect(
            url_for("login")
        )

    try:

        conversa_atual()

        session["plan"] = obter_plan_usuario(
            session["user"]
        )

    except Exception as e:

        print(
            "ERRO AO CARREGAR HOME:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message":
                "Erro ao carregar o banco de dados."
        }), 500

    return render_template(
        "index.html",
        username=session["user"],
        plan=session.get(
            "plan",
            "free"
        )
    )


@app.route("/login")
def login():

    if "user" in session:

        return redirect(
            url_for("home")
        )

    return render_template(
        "login.html"
    )


@app.route("/register")
def register():

    if "user" in session:

        return redirect(
            url_for("home")
        )

    return render_template(
        "register.html"
    )


@app.route("/logout")
def logout():

    session.clear()

    return redirect(
        url_for("login")
    )


# ============================================================
# LOGIN ADMIN
# ============================================================

@app.route(
    "/admin/login",
    methods=["GET", "POST"]
)
def admin_login():

    if request.method == "GET":

        if verificar_admin():

            return redirect(
                url_for("admin_dashboard")
            )

        return render_template(
            "admin_login.html"
        )

    data = request.get_json(
        silent=True
    ) or {}

    username = str(
        data.get("username") or ""
    ).strip()

    password = str(
        data.get("password") or ""
    )

    if not username or not password:

        return jsonify({
            "success": False,
            "message":
                "Preencha usuário e senha."
        }), 400

    if not ADMIN_USERNAME:

        return jsonify({
            "success": False,
            "message":
                "ADMIN_USERNAME não está configurado."
        }), 500

    if not ADMIN_PASSWORD:

        return jsonify({
            "success": False,
            "message":
                "ADMIN_PASSWORD não está configurado no servidor."
        }), 500

    if username != ADMIN_USERNAME:

        return jsonify({
            "success": False,
            "message":
                "Usuário ou senha administrativos incorretos."
        }), 401

    if password != ADMIN_PASSWORD:

        return jsonify({
            "success": False,
            "message":
                "Usuário ou senha administrativos incorretos."
        }), 401

    session.clear()

    session["admin"] = True
    session["user"] = ADMIN_USERNAME
    session["plan"] = "premium"

    return jsonify({
        "success": True,
        "message":
            "Login administrativo realizado com sucesso."
    })


# ============================================================
# PAINEL ADMIN
# ============================================================

@app.route("/admin")
def admin():

    return redirect(
        url_for("admin_login")
    )


@app.route("/admin/dashboard")
def admin_dashboard():

    if not verificar_admin():

        return redirect(
            url_for("admin_login")
        )

    return render_template(
        "admin.html",
        username=ADMIN_USERNAME
    )


@app.route("/admin/logout")
def admin_logout():

    session.clear()

    return redirect(
        url_for("admin_login")
    )


# ============================================================
# API ADMIN - USUÁRIOS
# ============================================================

@app.route("/api/admin/users")
def admin_users():

    if not verificar_admin():

        return jsonify({
            "success": False,
            "message":
                "Acesso negado."
        }), 403

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    username,
                    plan
                FROM users
                ORDER BY id DESC
            """)

            usuarios = cursor.fetchall()

    except Exception as e:

        print(
            "ERRO ADMIN USERS:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message":
                "Erro ao consultar usuários."
        }), 500

    total = len(usuarios)

    premium = sum(
        1
        for usuario in usuarios
        if (
            usuario["plan"]
            or "free"
        ).lower() == "premium"
    )

    free = total - premium

    return jsonify({

        "success":
            True,

        "stats": {

            "total":
                total,

            "free":
                free,

            "premium":
                premium

        },

        "users": [

            {
                "id":
                    usuario["id"],

                "username":
                    usuario["username"],

                "plan":
                    usuario["plan"] or "free"
            }

            for usuario in usuarios

        ]

    })


# ============================================================
# ALTERAR PLANO
# ============================================================

@app.route(
    "/api/admin/user/<int:user_id>/plan",
    methods=["POST"]
)
def admin_change_plan(user_id):

    if not verificar_admin():

        return jsonify({
            "success": False,
            "message":
                "Acesso negado."
        }), 403

    data = request.get_json(
        silent=True
    ) or {}

    plan = str(
        data.get("plan") or ""
    ).strip().lower()

    if plan not in [
        "free",
        "premium"
    ]:

        return jsonify({
            "success": False,
            "message":
                "Plano inválido."
        }), 400

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    username
                FROM users
                WHERE id = %s
            """, (
                user_id,
            ))

            usuario = cursor.fetchone()

            if not usuario:

                return jsonify({
                    "success": False,
                    "message":
                        "Usuário não encontrado."
                }), 404

            if usuario["username"] == ADMIN_USERNAME:

                return jsonify({
                    "success": False,
                    "message":
                        "O administrador não pode ter o plano alterado."
                }), 400

            cursor.execute("""
                UPDATE users
                SET plan = %s
                WHERE id = %s
            """, (
                plan,
                user_id
            ))

            conn.commit()

    except Exception as e:

        print(
            "ERRO ALTERAR PLANO:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message":
                "Erro interno ao alterar o plano."
        }), 500

    return jsonify({
        "success": True,
        "message":
            "Plano atualizado com sucesso.",
        "plan":
            plan
    })


# ============================================================
# EXCLUIR USUÁRIO
# ============================================================

@app.route(
    "/api/admin/user/<int:user_id>/delete",
    methods=["DELETE"]
)
def admin_delete_user(user_id):

    if not verificar_admin():

        return jsonify({
            "success": False,
            "message":
                "Acesso negado."
        }), 403

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT username
                FROM users
                WHERE id = %s
            """, (
                user_id,
            ))

            usuario = cursor.fetchone()

            if not usuario:

                return jsonify({
                    "success": False,
                    "message":
                        "Usuário não encontrado."
                }), 404

            if usuario["username"] == ADMIN_USERNAME:

                return jsonify({
                    "success": False,
                    "message":
                        "Você não pode excluir o administrador."
                }), 400

            username = usuario["username"]

            cursor.execute("""
                DELETE FROM chat_messages
                WHERE conversation_id IN (
                    SELECT id
                    FROM conversations
                    WHERE username = %s
                )
            """, (
                username,
            ))

            cursor.execute("""
                DELETE FROM conversations
                WHERE username = %s
            """, (
                username,
            ))

            cursor.execute("""
                DELETE FROM messages
                WHERE username = %s
            """, (
                username,
            ))

            cursor.execute("""
                DELETE FROM users
                WHERE id = %s
            """, (
                user_id,
            ))

            conn.commit()

    except Exception as e:

        print(
            "ERRO EXCLUIR USUÁRIO:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message":
                "Erro interno ao excluir usuário."
        }), 500

    return jsonify({
        "success": True,
        "message":
            "Usuário excluído com sucesso."
    })


# ============================================================
# REGISTER
# ============================================================

@app.route(
    "/api/register",
    methods=["POST"]
)
def api_register():

    data = request.get_json(
        silent=True
    ) or {}

    username = str(
        data.get("username") or ""
    ).strip()

    password = str(
        data.get("password") or ""
    )

    if not username or not password:

        return jsonify({
            "success": False,
            "message":
                "Preencha todos os campos."
        }), 400

    if len(username) < 3:

        return jsonify({
            "success": False,
            "message":
                "O usuário precisa ter pelo menos 3 caracteres."
        }), 400

    if len(username) > 30:

        return jsonify({
            "success": False,
            "message":
                "O usuário pode ter no máximo 30 caracteres."
        }), 400

    if len(password) < 6:

        return jsonify({
            "success": False,
            "message":
                "A senha precisa ter pelo menos 6 caracteres."
        }), 400

    if not any(
        caractere.isdigit()
        for caractere in password
    ):

        return jsonify({
            "success": False,
            "message":
                "A senha precisa ter pelo menos 1 número."
        }), 400

    if len(password) > 200:

        return jsonify({
            "success": False,
            "message":
                "A senha é muito longa."
        }), 400

    if username == ADMIN_USERNAME:

        return jsonify({
            "success": False,
            "message":
                "Esse nome de usuário não está disponível."
        }), 409

    password_hash = generate_password_hash(
        password
    )

    try:

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO users
                (username, password, plan)
                VALUES (%s, %s, %s)
            """, (
                username,
                password_hash,
                "free"
            ))

            conn.commit()

        return jsonify({
            "success": True,
            "message":
                "Conta criada com sucesso."
        })

    except psycopg2.IntegrityError:

        return jsonify({
            "success": False,
            "message":
                "Usuário já existe."
        }), 409

    except Exception as e:

        print(
            "ERRO REGISTER:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message":
                "Erro interno ao criar conta."
        }), 500


# ============================================================
# LOGIN
# ============================================================

@app.route(
    "/api/login",
    methods=["POST"]
)
def api_login():

    data = request.get_json(
        silent=True
    ) or {}

    username = str(
        data.get("username") or ""
    ).strip()

    password = str(
        data.get("password") or ""
    )

    if not username or not password:

        return jsonify({
            "success": False,
            "message":
                "Preencha usuário e senha."
        }), 400

    if username == ADMIN_USERNAME:

        return jsonify({
            "success": False,
            "message":
                "Use o acesso administrativo."
        }), 403

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    username,
                    password,
                    plan
                FROM users
                WHERE username = %s
            """, (
                username,
            ))

            user = cursor.fetchone()

            if not user:

                return jsonify({
                    "success": False,
                    "message":
                        "Usuário ou senha incorretos."
                }), 401

            senha_correta = False

            try:

                senha_correta = check_password_hash(
                    user["password"],
                    password
                )

            except Exception:

                senha_correta = False

            # =================================================
            # MIGRAÇÃO DE SENHAS ANTIGAS
            # =================================================

            if not senha_correta:

                senha_antiga = user["password"]

                if senha_antiga == password:

                    senha_correta = True

                    nova_hash = generate_password_hash(
                        password
                    )

                    cursor.execute("""
                        UPDATE users
                        SET password = %s
                        WHERE id = %s
                    """, (
                        nova_hash,
                        user["id"]
                    ))

                    conn.commit()

            if not senha_correta:

                return jsonify({
                    "success": False,
                    "message":
                        "Usuário ou senha incorretos."
                }), 401

            session.clear()

            session["user"] = user["username"]
            session["admin"] = False
            session["plan"] = (
                user["plan"]
                or "free"
            )

            conversation_id = criar_conversa(
                user["username"],
                "Nova conversa"
            )

            session["conversation_id"] = (
                conversation_id
            )

            session.modified = True

            return jsonify({

                "success":
                    True,

                "plan":
                    session["plan"],

                "conversation_id":
                    conversation_id

            })

    except Exception as e:

        print(
            "ERRO LOGIN:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message":
                "Erro interno no servidor."
        }), 500


# ============================================================
# CHAT
# ============================================================

@app.route(
    "/chat",
    methods=["POST"]
)
def chat():

    if "user" not in session:

        return jsonify({
            "reply":
                "Faça login primeiro.",

            "message":
                "Faça login primeiro.",

            "success":
                False

        }), 401

    try:

        # ====================================================
        # RECEBER JSON
        # ====================================================

        data = request.get_json(
            silent=True
        ) or {}

        mensagem = str(
            data.get("message") or ""
        ).strip()

        imagem_base64 = data.get("image")
        tipo_imagem = data.get("image_type")

        # ====================================================
        # VALIDAR MENSAGEM
        # ====================================================

        if len(mensagem) > 12000:

            return jsonify({
                "reply":
                    "Sua mensagem é muito grande. Tente enviar uma mensagem menor.",

                "message":
                    "Sua mensagem é muito grande. Tente enviar uma mensagem menor.",

                "success":
                    False

            }), 400

        # ====================================================
        # VALIDAR IMAGEM
        # ====================================================

        if imagem_base64:

            if not isinstance(
                imagem_base64,
                str
            ):

                return jsonify({
                    "reply":
                        "❌ Imagem inválida.",

                    "message":
                        "❌ Imagem inválida.",

                    "success":
                        False

                }), 400

            if not tipo_imagem:

                tipo_imagem = "image/jpeg"

            tipos_permitidos = [

                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif"

            ]

            if tipo_imagem not in tipos_permitidos:

                return jsonify({
                    "reply":
                        "❌ Formato de imagem não suportado. Use JPG, PNG, WEBP ou GIF.",

                    "message":
                        "❌ Formato de imagem não suportado. Use JPG, PNG, WEBP ou GIF.",

                    "success":
                        False

                }), 400

            if len(imagem_base64) > 27_000_000:

                return jsonify({
                    "reply":
                        "❌ A imagem é muito grande. Use uma imagem menor.",

                    "message":
                        "❌ A imagem é muito grande. Use uma imagem menor.",

                    "success":
                        False

                }), 400

        # ====================================================
        # PRECISA TER TEXTO OU IMAGEM
        # ====================================================

        if not mensagem and not imagem_base64:

            return jsonify({
                "reply":
                    "Digite uma mensagem ou envie uma imagem.",

                "message":
                    "Digite uma mensagem ou envie uma imagem.",

                "success":
                    False

            }), 400

        username = session["user"]

        plan = obter_plan_usuario(
            username
        )

        session["plan"] = plan

        # ====================================================
        # CONVERSA ATUAL
        # ====================================================

        conversation_id = conversa_atual()

        if not conversation_id:

            return jsonify({
                "reply":
                    "Não foi possível abrir a conversa.",

                "message":
                    "Não foi possível abrir a conversa.",

                "success":
                    False

            }), 500

        # ====================================================
        # LIMITE FREE
        # ====================================================

        with get_db() as conn:

            cursor = conn.cursor()

            if plan == "free":

                cursor.execute("""
                    SELECT COUNT(*)
                    FROM chat_messages cm
                    INNER JOIN conversations c
                    ON cm.conversation_id = c.id
                    WHERE c.username = %s
                    AND cm.sender = 'user'
                    AND DATE(cm.created_at) = CURRENT_DATE
                """, (
                    username,
                ))

                total = cursor.fetchone()[0]

                if total >= 20:

                    mensagem_limite = (
                        "❌ Limite diário do plano FREE "
                        "atingido (20 mensagens)."
                    )

                    return jsonify({

                        "reply":
                            mensagem_limite,

                        "message":
                            mensagem_limite,

                        "limit_reached":
                            True,

                        "success":
                            False,

                        "plan":
                            plan

                    }), 429

            # =================================================
            # SALVAR MENSAGEM
            # =================================================

            mensagem_salva = mensagem

            if imagem_base64:

                if mensagem:

                    mensagem_salva = (
                        "📷 [Imagem enviada]\n\n"
                        + mensagem
                    )

                else:

                    mensagem_salva = (
                        "📷 [Imagem enviada]"
                    )

            cursor.execute("""
                INSERT INTO chat_messages
                (conversation_id, sender, message)
                VALUES (%s, %s, %s)
                RETURNING id
            """, (
                conversation_id,
                "user",
                mensagem_salva
            ))

            resultado = cursor.fetchone()

            if not resultado:

                raise RuntimeError(
                    "Não foi possível salvar a mensagem."
                )

            mensagem_id = resultado[0]

            cursor.execute("""
                UPDATE conversations
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (
                conversation_id,
            ))

            conn.commit()

        # ====================================================
        # TÍTULO
        # ====================================================

        if mensagem:

            try:

                atualizar_titulo_se_necessario(
                    conversation_id,
                    mensagem
                )

            except Exception as erro_titulo:

                print(
                    "ERRO AO ATUALIZAR TÍTULO:",
                    repr(erro_titulo)
                )

        # ====================================================
        # DATA E HORA
        # ====================================================

        agora = datetime.now()

        data_atual = agora.strftime(
            "%d/%m/%Y"
        )

        hora_atual = agora.strftime(
            "%H:%M"
        )

        # ====================================================
        # ESTILO
        # ====================================================

        if plan == "free":

            estilo = """
Responda de forma clara, útil e objetiva.

Prefira respostas relativamente curtas,
mas não deixe de explicar o necessário.

Mantenha boa qualidade e organização.
"""

        else:

            estilo = """
Responda de forma completa, detalhada
e inteligente.

Quando necessário, explique passo a passo.

Use exemplos quando eles ajudarem
o usuário a entender.
"""

        # ====================================================
        # SYSTEM PROMPT
        # ====================================================

        mensagens_ia = [

            {
                "role":
                    "system",

                "content": f"""
Você é o Orion AI, um assistente
virtual brasileiro inteligente, útil,
natural e amigável.

Sua função é ajudar o usuário a
entender assuntos, estudar,
programar, resolver problemas,
criar ideias, escrever textos
e conversar.

Você também possui visão.

Quando o usuário enviar uma imagem:

- analise a imagem cuidadosamente;
- descreva o que realmente consegue ver;
- responda perguntas sobre a imagem;
- leia textos visíveis quando possível;
- analise gráficos, documentos,
  objetos e capturas de tela quando possível;
- não invente detalhes que não consegue identificar.

A data atual é:
{data_atual}

A hora atual é:
{hora_atual}

Responda em português do Brasil
quando o usuário falar português.

Tente entender erros de escrita,
abreviações e linguagem informal.

Use o histórico da conversa.

Responda diretamente e não fique
repetindo a pergunta.

Use Markdown quando ajudar.

Quando o usuário pedir código:

- entregue código funcional;
- preserve a estrutura existente;
- não remova funcionalidades sem motivo;
- explique brevemente as mudanças;
- se pedir arquivo inteiro,
  entregue o arquivo inteiro.

Não invente conscientemente
datas, números, nomes,
estatísticas ou informações.

Se não souber algo,
diga claramente.

Seja inteligente, natural,
educado, claro, útil e direto.

PLANO:

{estilo}
"""
            }

        ]

        # ====================================================
        # HISTÓRICO
        # ====================================================

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    sender,
                    message
                FROM chat_messages
                WHERE conversation_id = %s
                ORDER BY id DESC
                LIMIT 20
            """, (
                conversation_id,
            ))

            historico = cursor.fetchall()

        for item in reversed(historico):

            role = (
                "assistant"
                if item["sender"] == "bot"
                else "user"
            )

            mensagens_ia.append({

                "role":
                    role,

                "content":
                    item["message"]

            })

        # ====================================================
        # CONTEÚDO DA MENSAGEM ATUAL
        # ====================================================

        conteudo_usuario = []

        if mensagem:

            conteudo_usuario.append({

                "type":
                    "text",

                "text":
                    mensagem

            })

        if imagem_base64:

            conteudo_usuario.append({

                "type":
                    "image_url",

                "image_url": {

                    "url":
                        f"data:{tipo_imagem};base64,{imagem_base64}"

                }

            })

        # ====================================================
        # VERIFICAR GROQ
        # ====================================================

        if client is None:

            raise RuntimeError(
                "GROQ_API_KEY não configurada."
            )

        # ====================================================
        # CHAMADA GROQ
        # ====================================================

        mensagens_para_api = list(
            mensagens_ia
        )

        mensagens_para_api.append({

            "role":
                "user",

            "content":
                conteudo_usuario

        })

        resposta = client.chat.completions.create(

            model="qwen/qwen3.6-27b",

            messages=mensagens_para_api,

            temperature=0.7,

            max_completion_tokens=2048,

            reasoning_effort="none"

        )

        texto = (
            resposta
            .choices[0]
            .message
            .content
        )

        if not texto:

            texto = (
                "Não consegui gerar uma resposta."
            )

        # ====================================================
        # SALVAR RESPOSTA
        # ====================================================

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO chat_messages
                (conversation_id, sender, message)
                VALUES (%s, %s, %s)
            """, (
                conversation_id,
                "bot",
                texto
            ))

            cursor.execute("""
                UPDATE conversations
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (
                conversation_id,
            ))

            conn.commit()

        # ====================================================
        # RESPOSTA
        # ====================================================

        return jsonify({

            "success":
                True,

            "reply":
                texto,

            "message":
                texto,

            "conversation_id":
                conversation_id,

            "plan":
                plan

        })

    except Exception as e:

        print(
            "=================================================="
        )

        print(
            "ERRO NO CHAT:"
        )

        print(
            repr(e)
        )

        print(
            "=================================================="
        )

        # ====================================================
        # REVERTER MENSAGEM
        # ====================================================

        try:

            if "mensagem_id" in locals():

                with get_db() as conn:

                    cursor = conn.cursor()

                    cursor.execute("""
                        DELETE FROM chat_messages
                        WHERE id = %s
                        AND conversation_id = %s
                        AND sender = 'user'
                    """, (
                        mensagem_id,
                        conversation_id
                    ))

                    conn.commit()

        except Exception as erro_db:

            print(
                "ERRO AO REVERTER MENSAGEM:",
                repr(erro_db)
            )

        mensagem_erro = (
            "❌ Ocorreu um erro ao processar sua mensagem."
        )

        texto_erro = str(e).lower()

        if "api key" in texto_erro:

            mensagem_erro = (
                "❌ A GROQ_API_KEY não está configurada corretamente no Render."
            )

        elif "model" in texto_erro and (
            "not found" in texto_erro
            or "model_not_found" in texto_erro
        ):

            mensagem_erro = (
                "❌ O modelo da IA não está disponível para esta chave da Groq."
            )

        elif (
            "rate limit" in texto_erro
            or "429" in texto_erro
        ):

            mensagem_erro = (
                "❌ A IA atingiu o limite temporário de requisições. Tente novamente em alguns segundos."
            )

        elif (
            "database" in texto_erro
            or "postgres" in texto_erro
            or "psycopg2" in texto_erro
        ):

            mensagem_erro = (
                "❌ Erro ao acessar o banco de dados PostgreSQL."
            )

        return jsonify({

            "success":
                False,

            "reply":
                mensagem_erro,

            "message":
                mensagem_erro

        }), 500


# ============================================================
# LISTAR CONVERSAS
# ============================================================

@app.route("/conversations")
def conversations():

    if "user" not in session:

        return jsonify({
            "success": False,
            "message":
                "Faça login primeiro.",
            "conversations":
                []
        }), 401

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    title,
                    created_at,
                    updated_at
                FROM conversations
                WHERE username = %s
                ORDER BY updated_at DESC, id DESC
            """, (
                session["user"],
            ))

            lista = cursor.fetchall()

        return jsonify([

            {
                "id":
                    item["id"],

                "title":
                    item["title"] or "Nova conversa",

                "created_at":
                    item["created_at"].isoformat()
                    if item["created_at"]
                    else None,

                "updated_at":
                    item["updated_at"].isoformat()
                    if item["updated_at"]
                    else None
            }

            for item in lista

        ])

    except Exception as e:

        print(
            "ERRO CONVERSATIONS:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message":
                "Erro ao carregar conversas.",
            "conversations":
                []
        }), 500


# ============================================================
# ALIAS API - CONVERSAS
# ============================================================

@app.route("/api/conversations")
def api_conversations():

    return conversations()


# ============================================================
# ABRIR CONVERSA
# ============================================================

@app.route(
    "/conversation/<int:conversation_id>"
)
def open_conversation(
    conversation_id
):

    if "user" not in session:

        return jsonify({
            "success":
                False,

            "message":
                "Faça login primeiro."
        }), 401

    try:

        if not verificar_conversa(
            session["user"],
            conversation_id
        ):

            return jsonify({
                "success":
                    False,

                "message":
                    "Conversa não encontrada."
            }), 404

        session["conversation_id"] = (
            conversation_id
        )

        session.modified = True

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    sender,
                    message,
                    created_at
                FROM chat_messages
                WHERE conversation_id = %s
                ORDER BY id ASC
            """, (
                conversation_id,
            ))

            mensagens = cursor.fetchall()

            cursor.execute("""
                SELECT
                    title,
                    created_at,
                    updated_at
                FROM conversations
                WHERE id = %s
                AND username = %s
            """, (
                conversation_id,
                session["user"]
            ))

            conversa = cursor.fetchone()

        return jsonify({

            "success":
                True,

            "conversation_id":
                conversation_id,

            "title": (
                conversa["title"]
                if conversa
                else "Nova conversa"
            ),

            "created_at": (
                conversa["created_at"].isoformat()
                if conversa and conversa["created_at"]
                else None
            ),

            "updated_at": (
                conversa["updated_at"].isoformat()
                if conversa and conversa["updated_at"]
                else None
            ),

            "messages": [

                {
                    "sender":
                        item["sender"],

                    "message":
                        item["message"],

                    "created_at":
                        item["created_at"].isoformat()
                        if item["created_at"]
                        else None
                }

                for item in mensagens

            ]

        })

    except Exception as e:

        print(
            "ERRO OPEN CONVERSATION:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message":
                "Erro ao abrir a conversa."
        }), 500


# ============================================================
# ALIAS API - ABRIR CONVERSA
# ============================================================

@app.route(
    "/api/conversation/<int:conversation_id>"
)
def api_open_conversation(
    conversation_id
):

    return open_conversation(
        conversation_id
    )


# ============================================================
# HISTORY
# ============================================================

@app.route("/history")
def history():

    if "user" not in session:

        return jsonify({
            "success":
                False,

            "message":
                "Faça login primeiro.",

            "history":
                []

        }), 401

    try:

        conversation_id = conversa_atual()

        if not conversation_id:

            return jsonify([])

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    sender,
                    message,
                    created_at
                FROM chat_messages
                WHERE conversation_id = %s
                ORDER BY id ASC
            """, (
                conversation_id,
            ))

            mensagens = cursor.fetchall()

        return jsonify([

            {
                "sender":
                    item["sender"],

                "message":
                    item["message"],

                "created_at":
                    item["created_at"].isoformat()
                    if item["created_at"]
                    else None
            }

            for item in mensagens

        ])

    except Exception as e:

        print(
            "ERRO HISTORY:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message":
                "Erro ao carregar histórico.",
            "history":
                []
        }), 500


# ============================================================
# ALIAS API - HISTORY
# ============================================================

@app.route("/api/history")
def api_history():

    return history()


# ============================================================
# NOVA CONVERSA
# ============================================================

@app.route(
    "/new_chat",
    methods=["POST"]
)
def new_chat():

    if "user" not in session:

        return jsonify({
            "success":
                False,

            "message":
                "Faça login primeiro."
        }), 401

    try:

        username = session["user"]

        conversation_id = criar_conversa(
            username,
            "Nova conversa"
        )

        session["conversation_id"] = (
            conversation_id
        )

        session.modified = True

        print(
            f"Nova conversa criada: "
            f"{conversation_id} - {username}"
        )

        return jsonify({

            "success":
                True,

            "conversation_id":
                conversation_id,

            "title":
                "Nova conversa"

        })

    except Exception as e:

        print(
            "ERRO NEW CHAT:",
            repr(e)
        )

        return jsonify({

            "success":
                False,

            "message":
                "Erro ao criar uma nova conversa."

        }), 500


# ============================================================
# ALIAS API - NOVA CONVERSA
# ============================================================

@app.route(
    "/api/new_chat",
    methods=["POST"]
)
def api_new_chat():

    return new_chat()


# ============================================================
# RENOMEAR CONVERSA
# ============================================================

@app.route(
    "/conversation/<int:conversation_id>/rename",
    methods=["POST"]
)
def rename_conversation(
    conversation_id
):

    if "user" not in session:

        return jsonify({
            "success":
                False,

            "message":
                "Faça login primeiro."
        }), 401

    try:

        if not verificar_conversa(
            session["user"],
            conversation_id
        ):

            return jsonify({
                "success":
                    False,

                "message":
                    "Conversa não encontrada."
            }), 404

        data = request.get_json(
            silent=True
        ) or {}

        title = str(
            data.get("title") or ""
        ).strip()

        if not title:

            return jsonify({
                "success":
                    False,

                "message":
                    "Digite um nome para a conversa."
            }), 400

        if len(title) > 100:

            title = title[:100].rstrip()

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                UPDATE conversations
                SET title = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                AND username = %s
            """, (
                title,
                conversation_id,
                session["user"]
            ))

            conn.commit()

        return jsonify({

            "success":
                True,

            "title":
                title

        })

    except Exception as e:

        print(
            "ERRO RENAME:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message":
                "Erro ao renomear conversa."
        }), 500


# ============================================================
# ALIAS API - RENOMEAR
# ============================================================

@app.route(
    "/api/conversation/<int:conversation_id>/rename",
    methods=["POST"]
)
def api_rename_conversation(
    conversation_id
):

    return rename_conversation(
        conversation_id
    )


# ============================================================
# EXCLUIR CONVERSA
# ============================================================

@app.route(
    "/conversation/<int:conversation_id>",
    methods=["DELETE"]
)
def delete_conversation(
    conversation_id
):

    if "user" not in session:

        return jsonify({
            "success":
                False,

            "message":
                "Faça login primeiro."
        }), 401

    try:

        if not verificar_conversa(
            session["user"],
            conversation_id
        ):

            return jsonify({
                "success":
                    False,

                "message":
                    "Conversa não encontrada."
            }), 404

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                DELETE FROM conversations
                WHERE id = %s
                AND username = %s
            """, (
                conversation_id,
                session["user"]
            ))

            conn.commit()

        if session.get(
            "conversation_id"
        ) == conversation_id:

            nova_conversa = criar_conversa(
                session["user"],
                "Nova conversa"
            )

            session["conversation_id"] = (
                nova_conversa
            )

            session.modified = True

        return jsonify({

            "success":
                True,

            "conversation_id":
                session.get(
                    "conversation_id"
                )

        })

    except Exception as e:

        print(
            "ERRO DELETE CONVERSATION:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message":
                "Erro ao excluir conversa."
        }), 500


# ============================================================
# EXCLUIR VÁRIAS CONVERSAS
# ============================================================

@app.route(
    "/conversations/delete-multiple",
    methods=["POST"]
)
def delete_multiple_conversations():

    if "user" not in session:

        return jsonify({
            "success": False,
            "message":
                "Faça login primeiro."
        }), 401

    try:

        data = request.get_json(
            silent=True
        ) or {}

        ids = data.get("ids")

        if not isinstance(ids, list):

            return jsonify({
                "success": False,
                "message":
                    "Lista de conversas inválida."
            }), 400

        if not ids:

            return jsonify({
                "success": False,
                "message":
                    "Nenhuma conversa foi selecionada."
            }), 400

        conversation_ids = []

        for item in ids:

            try:

                conversation_id = int(item)

            except (
                ValueError,
                TypeError
            ):

                continue

            if conversation_id > 0:

                conversation_ids.append(
                    conversation_id
                )

        conversation_ids = list(
            dict.fromkeys(
                conversation_ids
            )
        )

        if not conversation_ids:

            return jsonify({
                "success": False,
                "message":
                    "Nenhuma conversa válida foi selecionada."
            }), 400

        username = session["user"]

        conversa_atual_id = session.get(
            "conversation_id"
        )

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                DELETE FROM conversations
                WHERE username = %s
                AND id = ANY(%s)
                RETURNING id
            """, (
                username,
                conversation_ids
            ))

            excluidas = cursor.fetchall()

            conn.commit()

        ids_excluidos = [
            item[0]
            for item in excluidas
        ]

        conversa_atual_excluida = (
            conversa_atual_id is not None
            and int(conversa_atual_id)
            in ids_excluidos
        )

        if conversa_atual_excluida:

            nova_conversa = criar_conversa(
                username,
                "Nova conversa"
            )

            session["conversation_id"] = (
                nova_conversa
            )

            session.modified = True

        elif not session.get(
            "conversation_id"
        ):

            nova_conversa = criar_conversa(
                username,
                "Nova conversa"
            )

            session["conversation_id"] = (
                nova_conversa
            )

            session.modified = True

        return jsonify({

            "success":
                True,

            "message":
                f"{len(ids_excluidos)} conversa(s) excluída(s) permanentemente.",

            "deleted_ids":
                ids_excluidos,

            "deleted_count":
                len(ids_excluidos),

            "conversation_id":
                session.get(
                    "conversation_id"
                )

        })

    except Exception as e:

        print(
            "ERRO DELETE MULTIPLE CONVERSATIONS:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message":
                "Erro ao excluir as conversas."
        }), 500


# ============================================================
# ALIAS API - EXCLUIR VÁRIAS
# ============================================================

@app.route(
    "/api/conversations/delete-multiple",
    methods=["POST"]
)
def api_delete_multiple_conversations():

    return delete_multiple_conversations()


# ============================================================
# PLANO
# ============================================================

@app.route("/api/plan")
def api_plan():

    if "user" not in session:

        return jsonify({
            "success":
                False,

            "message":
                "Faça login primeiro."
        }), 401

    try:

        plan = obter_plan_usuario(
            session["user"]
        )

        session["plan"] = plan

        return jsonify({

            "success":
                True,

            "plan":
                plan

        })

    except Exception as e:

        print(
            "ERRO PLAN:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message":
                "Erro ao consultar plano."
        }), 500


# ============================================================
# STATUS
# ============================================================

@app.route("/api/status")
def api_status():

    if "user" not in session:

        return jsonify({
            "logged":
                False
        })

    try:

        return jsonify({

            "logged":
                True,

            "username":
                session["user"],

            "plan":
                obter_plan_usuario(
                    session["user"]
                ),

            "conversation_id":
                session.get(
                    "conversation_id"
                ),

            "admin":
                verificar_admin()

        })

    except Exception as e:

        print(
            "ERRO STATUS:",
            repr(e)
        )

        return jsonify({

            "logged":
                True,

            "username":
                session["user"],

            "plan":
                "free",

            "conversation_id":
                session.get(
                    "conversation_id"
                ),

            "admin":
                verificar_admin()

        })


# ============================================================
# TRATAMENTO DE ERRO 404
# ============================================================
#
# IMPORTANTE:
#
# O erro:
#
# Unexpected token 'P', "Página não..." is not valid JSON
#
# acontecia porque o navegador fazia fetch()
# esperando JSON, mas o Flask devolvia:
#
# Página não encontrada.
#
# Agora TODA rota desconhecida retorna JSON.
# ============================================================

@app.errorhandler(404)
def erro_404(error):

    print(
        "ROTA 404:",
        request.method,
        request.path
    )

    return jsonify({

        "success":
            False,

        "error":
            "not_found",

        "message":
            "Rota não encontrada.",

        "path":
            request.path

    }), 404


# ============================================================
# TRATAMENTO DE ERRO 500
# ============================================================

@app.errorhandler(500)
def erro_500(error):

    print(
        "ERRO 500 GLOBAL:",
        repr(error)
    )

    return jsonify({

        "success":
            False,

        "error":
            "internal_server_error",

        "message":
            "Erro interno no servidor."

    }), 500


# ============================================================
# START
# ============================================================

if __name__ == "__main__":

    port = int(
        os.environ.get(
            "PORT",
            5000
        )
    )

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )

