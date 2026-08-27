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


app = Flask(__name__)


# ============================================================
# CONFIGURAÇÕES
# ============================================================

app.secret_key = os.getenv(
    "FLASK_SECRET_KEY",
    "pedrogpt_secret_key"
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

DATABASE_URL = os.getenv("DATABASE_URL")

ADMIN_USERNAME = os.getenv(
    "ADMIN_USERNAME",
    "admin"
)

ADMIN_PASSWORD = os.getenv(
    "ADMIN_PASSWORD"
)

client = Groq(
    api_key=GROQ_API_KEY
) if GROQ_API_KEY else None


# ============================================================
# BANCO DE DADOS POSTGRESQL
# ============================================================

def get_db():

    if not DATABASE_URL:

        raise RuntimeError(
            "DATABASE_URL não está configurada no servidor."
        )

    conn = psycopg2.connect(
        DATABASE_URL
    )

    return conn


# ============================================================
# INICIALIZAR BANCO
# ============================================================

def init_db():

    with get_db() as conn:

        cursor = conn.cursor(
            cursor_factory=psycopg2.extras.RealDictCursor
        )

        # ====================================================
        # USUÁRIOS
        # ====================================================

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                plan TEXT DEFAULT 'free'
            )
        """)

        # ====================================================
        # MENSAGENS ANTIGAS
        # ====================================================

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                username TEXT,
                sender TEXT,
                message TEXT
            )
        """)

        # ====================================================
        # CONVERSAS
        # ====================================================

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                title TEXT DEFAULT 'Nova conversa',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ====================================================
        # MENSAGENS DAS CONVERSAS
        # ====================================================

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

        # ====================================================
        # GARANTE COLUNA PLAN
        # ====================================================

        cursor.execute("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free'
        """)

        conn.commit()


try:

    init_db()

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

        "version": "1.2",

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

        conversation_id = cursor.fetchone()[0]

        conn.commit()

        return conversation_id


def verificar_conversa(
    username,
    conversation_id
):

    if not conversation_id:
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

        if verificar_conversa(
            username,
            conversation_id
        ):

            return conversation_id

    conversation_id = criar_conversa(
        username,
        "Nova conversa"
    )

    session["conversation_id"] = conversation_id

    return conversation_id


def gerar_titulo(mensagem):

    titulo = (
        mensagem
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
        )

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

        return usuario["plan"] or "free"


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

    conversa_atual()

    session["plan"] = obter_plan_usuario(
        session["user"]
    )

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

    username = (
        data.get("username") or ""
    ).strip()

    password = (
        data.get("password") or ""
    )

    if not username or not password:

        return jsonify({
            "success": False,
            "message":
                "Preencha usuário e senha."
        }), 400

    if not ADMIN_USERNAME or not ADMIN_PASSWORD:

        print(
            "ERRO: ADMIN_USERNAME ou ADMIN_PASSWORD "
            "não configurado."
        )

        return jsonify({
            "success": False,
            "message":
                "Login administrativo não configurado."
        }), 500

    if (
        username != ADMIN_USERNAME
        or password != ADMIN_PASSWORD
    ):

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


# ============================================================
# LOGOUT ADMIN
# ============================================================

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

    total = len(usuarios)

    premium = sum(
        1
        for usuario in usuarios
        if (usuario["plan"] or "free") == "premium"
    )

    free = total - premium

    return jsonify({

        "success": True,

        "stats": {

            "total": total,

            "free": free,

            "premium": premium

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

    plan = (
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

        # ====================================================
        # REMOVE MENSAGENS DAS CONVERSAS
        # ====================================================

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

        # ====================================================
        # REMOVE CONVERSAS
        # ====================================================

        cursor.execute("""
            DELETE FROM conversations
            WHERE username = %s
        """, (
            username,
        ))

        # ====================================================
        # REMOVE HISTÓRICO ANTIGO
        # ====================================================

        cursor.execute("""
            DELETE FROM messages
            WHERE username = %s
        """, (
            username,
        ))

        # ====================================================
        # REMOVE USUÁRIO
        # ====================================================

        cursor.execute("""
            DELETE FROM users
            WHERE id = %s
        """, (
            user_id,
        ))

        conn.commit()

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

    username = (
        data.get("username") or ""
    ).strip()

    password = (
        data.get("password") or ""
    ).strip()

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

    if len(password) < 4:

        return jsonify({
            "success": False,
            "message":
                "A senha precisa ter pelo menos 4 caracteres."
        }), 400

    if len(password) > 200:

        return jsonify({
            "success": False,
            "message":
                "A senha é muito longa."
        }), 400

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

    username = (
        data.get("username") or ""
    ).strip()

    password = (
        data.get("password") or ""
    ).strip()

    if not username or not password:

        return jsonify({
            "success": False,
            "message":
                "Preencha usuário e senha."
        }), 400

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

        # ====================================================
        # MIGRAÇÃO DE SENHAS ANTIGAS
        # ====================================================

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

        # ====================================================
        # LOGIN OK
        # ====================================================

        session.clear()

        session["user"] = user["username"]

        session["admin"] = (
            user["username"] == ADMIN_USERNAME
        )

        session["plan"] = (
            user["plan"] or "free"
        )

        conversation_id = criar_conversa(
            user["username"],
            "Nova conversa"
        )

        session["conversation_id"] = (
            conversation_id
        )

        return jsonify({

            "success": True,

            "plan":
                session["plan"],

            "conversation_id":
                conversation_id

        })


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

            "success": False

        }), 401

    data = request.get_json(
        silent=True
    ) or {}

    mensagem = (
        data.get("message") or ""
    ).strip()

    if not mensagem:

        return jsonify({

            "reply":
                "Digite uma mensagem.",

            "success": False

        }), 400

    if len(mensagem) > 12000:

        return jsonify({

            "reply":
                "Sua mensagem é muito grande. Tente enviar uma mensagem menor.",

            "success": False

        }), 400

    username = session["user"]

    plan = obter_plan_usuario(
        username
    )

    session["plan"] = plan

    conversation_id = conversa_atual()

    if not conversation_id:

        return jsonify({

            "reply":
                "Não foi possível abrir a conversa.",

            "success": False

        }), 500

    # ========================================================
    # LIMITE FREE
    # ========================================================

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

                AND DATE(cm.created_at)
                    = CURRENT_DATE
            """, (
                username,
            ))

            total = cursor.fetchone()[0]

            if total >= 20:

                return jsonify({

                    "reply":
                        "❌ Limite diário do plano FREE atingido (20 mensagens).",

                    "limit_reached": True,

                    "plan": plan

                }), 429

        # ====================================================
        # SALVA MENSAGEM
        # ====================================================

        cursor.execute("""
            INSERT INTO chat_messages
            (conversation_id, sender, message)
            VALUES (%s, %s, %s)
        """, (
            conversation_id,
            "user",
            mensagem
        ))

        cursor.execute("""
            UPDATE conversations
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (
            conversation_id,
        ))

        conn.commit()

    # ========================================================
    # TÍTULO
    # ========================================================

    atualizar_titulo_se_necessario(
        conversation_id,
        mensagem
    )

    # ========================================================
    # DATA E HORA
    # ========================================================

    agora = datetime.now()

    data_atual = agora.strftime(
        "%d/%m/%Y"
    )

    hora_atual = agora.strftime(
        "%H:%M"
    )

    # ========================================================
    # ESTILO DO PLANO
    # ========================================================

    if plan == "free":

        estilo = """
Responda de forma clara, útil e objetiva.

Prefira respostas relativamente curtas,
mas não deixe de explicar o necessário.

Mesmo no plano FREE, mantenha boa
qualidade e organização.
"""

    else:

        estilo = """
Responda de forma completa, detalhada
e inteligente.

Quando necessário, explique passo a passo.

Use exemplos quando eles ajudarem
o usuário a entender.
"""

    # ========================================================
    # PERSONALIDADE
    # ========================================================

    mensagens_ia = [

        {

            "role": "system",

            "content": f"""
Você é o PedroGPT, um assistente
virtual brasileiro inteligente, útil,
natural e amigável.

Sua função é ajudar o usuário a
entender assuntos, estudar,
programar, resolver problemas,
criar ideias, escrever textos
e conversar.

==================================================
DATA E HORA
==================================================

A data atual é:

{data_atual}

A hora atual é:

{hora_atual}

Use essas informações quando o usuário
perguntar sobre hoje, amanhã, ontem,
datas ou horários.

Não invente a data atual.

==================================================
IDIOMA
==================================================

- Responda em português do Brasil
  quando o usuário falar português.
- Se o usuário falar outro idioma,
  responda nesse idioma quando apropriado.

==================================================
ENTENDIMENTO
==================================================

Tente entender a intenção do usuário
mesmo quando ele:

- escrever errado;
- usar abreviações;
- escrever informalmente;
- esquecer acentos;
- escrever frases curtas;
- misturar idiomas.

Não critique erros de escrita.

==================================================
CONTEXTO
==================================================

Use o histórico da conversa.

Se o usuário disser:

"e ele?"

tente identificar a quem "ele"
se refere usando o contexto.

Se disser:

"faça isso"

entenda o que é "isso"
pelo contexto.

Não peça esclarecimento quando
o contexto já permitir entender
o pedido.

==================================================
RESPOSTAS
==================================================

Responda diretamente.

Não repita a pergunta
desnecessariamente.

Não fique enrolando.

Se a pergunta for simples,
responda simplesmente.

Se for complexa,
explique de forma organizada.

==================================================
FORMATAÇÃO
==================================================

Use Markdown quando ajudar
na organização.

Pode utilizar:

**Negrito**

- Tópicos

1. Passo um
2. Passo dois

### Título

Use parágrafos curtos.

Não transforme todas as respostas
em listas.

==================================================
CÓDIGO
==================================================

Quando o usuário pedir código:

- entregue código funcional;
- preserve a estrutura existente
  quando solicitado;
- não remova funcionalidades
  sem motivo;
- explique brevemente as mudanças;
- use blocos de código Markdown;
- se pedir um arquivo inteiro,
  entregue o arquivo inteiro.

==================================================
ESTUDOS
==================================================

Quando ajudar em estudos:

- explique de maneira simples;
- use exemplos;
- destaque conceitos importantes;
- faça exercícios quando ajudar.

==================================================
PRECISÃO
==================================================

Nunca invente conscientemente:

- datas;
- números;
- nomes;
- estatísticas;
- acontecimentos;
- fontes;
- links;
- informações atuais.

Se não souber algo,
diga claramente.

Não transforme suposições em fatos.

Não finja ter pesquisado na internet
quando não pesquisou.

==================================================
CONVERSA
==================================================

Se o usuário estiver apenas conversando,
converse naturalmente.

Não transforme toda conversa
em uma aula.

==================================================
ESTILO
==================================================

Seja:

- inteligente;
- natural;
- educado;
- claro;
- útil;
- direto;
- organizado.

Não fique repetindo
"como IA".

Não diga constantemente
"sou o PedroGPT".

==================================================
PLANO
==================================================

{estilo}

==================================================
REGRA PRINCIPAL
==================================================

Antes de responder:

1. Entenda a pergunta.
2. Analise o contexto.
3. Verifique se a data é relevante.
4. Escolha a melhor forma de responder.
5. Organize a resposta.
6. Evite informações inventadas.
"""
        }

    ]

    # ========================================================
    # HISTÓRICO
    # ========================================================

    with get_db() as conn:

        cursor = conn.cursor(
            cursor_factory=psycopg2.extras.RealDictCursor
        )

        cursor.execute("""
            SELECT sender, message
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

    # ========================================================
    # VERIFICA API
    # ========================================================

    if client is None:

        return jsonify({

            "reply":
                "❌ A chave GROQ_API_KEY não está configurada no servidor.",

            "success": False

        }), 500

    # ========================================================
    # GROQ
    # ========================================================

    try:

        resposta = client.chat.completions.create(

            model="openai/gpt-oss-120b",

            messages=mensagens_ia,

            temperature=0.7,

            max_completion_tokens=2048

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

    except Exception as e:

        print(
            "ERRO GROQ:",
            repr(e)
        )

        try:

            with get_db() as conn:

                cursor = conn.cursor()

                cursor.execute("""
                    DELETE FROM chat_messages
                    WHERE id = (
                        SELECT MAX(id)
                        FROM chat_messages
                        WHERE conversation_id = %s
                        AND sender = 'user'
                    )
                """, (
                    conversation_id,
                ))

                conn.commit()

        except Exception as erro_db:

            print(
                "ERRO AO REVERTER MENSAGEM:",
                repr(erro_db)
            )

        return jsonify({

            "reply":
                "❌ Ocorreu um erro ao conectar com a IA. Tente novamente.",

            "success": False

        }), 500

    # ========================================================
    # SALVA RESPOSTA
    # ========================================================

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

    # ========================================================
    # RESPOSTA
    # ========================================================

    return jsonify({

        "success": True,

        "reply":
            texto,

        "conversation_id":
            conversation_id,

        "plan":
            plan

    })


# ============================================================
# LISTAR CONVERSAS
# ============================================================

@app.route("/conversations")
def conversations():

    if "user" not in session:

        return jsonify([]), 401

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
                item["created_at"],

            "updated_at":
                item["updated_at"]

        }

        for item in lista

    ])


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

            "success": False,

            "message":
                "Faça login primeiro."

        }), 401

    if not verificar_conversa(
        session["user"],
        conversation_id
    ):

        return jsonify({

            "success": False,

            "message":
                "Conversa não encontrada."

        }), 404

    session["conversation_id"] = (
        conversation_id
    )

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

        "success": True,

        "conversation_id":
            conversation_id,

        "title": (
            conversa["title"]
            if conversa
            else "Nova conversa"
        ),

        "created_at": (
            conversa["created_at"]
            if conversa
            else None
        ),

        "updated_at": (
            conversa["updated_at"]
            if conversa
            else None
        ),

        "messages": [

            {

                "sender":
                    item["sender"],

                "message":
                    item["message"],

                "created_at":
                    item["created_at"]

            }

            for item in mensagens

        ]

    })


# ============================================================
# HISTORY
# ============================================================

@app.route("/history")
def history():

    if "user" not in session:

        return jsonify([]), 401

    conversation_id = conversa_atual()

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
                item["created_at"]

        }

        for item in mensagens

    ])


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

            "success": False,

            "message":
                "Faça login primeiro."

        }), 401

    conversation_id = criar_conversa(

        session["user"],

        "Nova conversa"

    )

    session["conversation_id"] = (
        conversation_id
    )

    return jsonify({

        "success": True,

        "conversation_id":
            conversation_id,

        "title":
            "Nova conversa"

    })


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

            "success": False,

            "message":
                "Faça login primeiro."

        }), 401

    if not verificar_conversa(

        session["user"],

        conversation_id

    ):

        return jsonify({

            "success": False,

            "message":
                "Conversa não encontrada."

        }), 404

    data = request.get_json(
        silent=True
    ) or {}

    title = (
        data.get("title") or ""
    ).strip()

    if not title:

        return jsonify({

            "success": False,

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

        "success": True,

        "title":
            title

    })


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

            "success": False,

            "message":
                "Faça login primeiro."

        }), 401

    if not verificar_conversa(

        session["user"],

        conversation_id

    ):

        return jsonify({

            "success": False,

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

    return jsonify({

        "success": True,

        "conversation_id":
            session.get(
                "conversation_id"
            )

    })


# ============================================================
# PLANO
# ============================================================

@app.route("/api/plan")
def api_plan():

    if "user" not in session:

        return jsonify({

            "success": False,

            "message":
                "Faça login primeiro."

        }), 401

    plan = obter_plan_usuario(
        session["user"]
    )

    session["plan"] = plan

    return jsonify({

        "success": True,

        "plan":
            plan

    })


# ============================================================
# STATUS
# ============================================================

@app.route("/api/status")
def api_status():

    if "user" not in session:

        return jsonify({

            "logged": False

        })

    return jsonify({

        "logged": True,

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
