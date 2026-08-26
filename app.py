import os
import sqlite3
import base64
import mimetypes
from datetime import datetime

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    session,
    redirect,
    url_for,
    send_from_directory
)

from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

from groq import Groq


app = Flask(__name__)


# =========================================================
# CONFIGURAÇÕES
# =========================================================

app.secret_key = os.getenv(
    "FLASK_SECRET_KEY",
    "pedrogpt_secret_key"
)

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)


# =========================================================
# UPLOADS
# =========================================================

UPLOAD_FOLDER = "uploads"

os.makedirs(
    UPLOAD_FOLDER,
    exist_ok=True
)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# Limite máximo por arquivo: 10 MB
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024


ALLOWED_IMAGE_EXTENSIONS = {
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif"
}


ALLOWED_TEXT_EXTENSIONS = {
    "txt",
    "py",
    "js",
    "html",
    "css",
    "json",
    "xml",
    "csv",
    "md",
    "java",
    "c",
    "cpp",
    "h",
    "hpp",
    "sql",
    "php",
    "ts",
    "tsx",
    "jsx",
    "sh",
    "bat"
}


def arquivo_e_imagem(nome):

    extensao = (
        nome
        .rsplit(".", 1)[-1]
        .lower()
        if "." in nome
        else ""
    )

    return extensao in ALLOWED_IMAGE_EXTENSIONS


def arquivo_e_texto(nome):

    extensao = (
        nome
        .rsplit(".", 1)[-1]
        .lower()
        if "." in nome
        else ""
    )

    return extensao in ALLOWED_TEXT_EXTENSIONS


# =========================================================
# VERSION
# =========================================================

@app.route("/version")
def version():

    return {
        "version": "1.3",
        "apk_url": "https://drive.google.com/file/d/1mdpeCrIJNcU2DlHLabjgh17zvM2ha703/view?usp=drive_link"
    }


# =========================================================
# BANCO DE DADOS
# =========================================================

def get_db():

    conn = sqlite3.connect(
        "database.db",
        timeout=10,
        check_same_thread=False
    )

    conn.row_factory = sqlite3.Row

    conn.execute(
        "PRAGMA journal_mode=WAL"
    )

    return conn


def init_db():

    with get_db() as conn:

        cursor = conn.cursor()

        # =================================================
        # USUÁRIOS
        # =================================================

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            plan TEXT DEFAULT 'free'
        )
        """)

        # =================================================
        # MENSAGENS ANTIGAS
        # =================================================

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            sender TEXT,
            message TEXT
        )
        """)

        # =================================================
        # CONVERSAS
        # =================================================

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            title TEXT DEFAULT 'Nova conversa',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

        # =================================================
        # MENSAGENS
        # =================================================

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            sender TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
        )
        """)

        # =================================================
        # ANEXOS
        # =================================================

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            original_name TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            file_type TEXT,
            file_size INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
        )
        """)

        conn.commit()

        # =================================================
        # MIGRAÇÃO DO HISTÓRICO ANTIGO
        # =================================================

        cursor.execute("""
        SELECT username
        FROM messages
        GROUP BY username
        """)

        usuarios_antigos = cursor.fetchall()

        for usuario in usuarios_antigos:

            username = usuario["username"]

            cursor.execute("""
            SELECT id
            FROM conversations
            WHERE username=?
            LIMIT 1
            """, (
                username,
            ))

            conversa = cursor.fetchone()

            if conversa:
                continue

            cursor.execute("""
            SELECT sender, message
            FROM messages
            WHERE username=?
            ORDER BY id ASC
            """, (
                username,
            ))

            mensagens_antigas = cursor.fetchall()

            if not mensagens_antigas:
                continue

            cursor.execute("""
            INSERT INTO conversations
            (username, title)
            VALUES (?, ?)
            """, (
                username,
                "Conversa antiga"
            ))

            conversation_id = cursor.lastrowid

            for mensagem in mensagens_antigas:

                cursor.execute("""
                INSERT INTO chat_messages
                (conversation_id, sender, message)
                VALUES (?, ?, ?)
                """, (
                    conversation_id,
                    mensagem["sender"],
                    mensagem["message"]
                ))

        conn.commit()


init_db()


# =========================================================
# FUNÇÕES AUXILIARES
# =========================================================

def criar_conversa(
    username,
    titulo="Nova conversa"
):

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
        INSERT INTO conversations
        (username, title)
        VALUES (?, ?)
        """, (
            username,
            titulo
        ))

        conversation_id = cursor.lastrowid

        conn.commit()

        return conversation_id


def verificar_conversa(
    username,
    conversation_id
):

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
        SELECT id
        FROM conversations
        WHERE id=? AND username=?
        """, (
            conversation_id,
            username
        ))

        return cursor.fetchone() is not None


def conversa_atual():

    if "user" not in session:
        return None

    conversation_id = session.get(
        "conversation_id"
    )

    if conversation_id:

        if verificar_conversa(
            session["user"],
            conversation_id
        ):

            return conversation_id

    conversation_id = criar_conversa(
        session["user"]
    )

    session["conversation_id"] = conversation_id

    return conversation_id


def tamanho_arquivo(caminho):

    try:
        return os.path.getsize(caminho)

    except Exception:
        return 0


# =========================================================
# PÁGINAS
# =========================================================

@app.route("/")
def home():

    if "user" not in session:

        return redirect(
            url_for("login")
        )

    conversa_atual()

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

    return render_template(
        "login.html"
    )


@app.route("/register")
def register():

    return render_template(
        "register.html"
    )


@app.route("/logout")
def logout():

    session.clear()

    return redirect(
        url_for("login")
    )


# =========================================================
# REGISTER
# =========================================================

@app.route(
    "/api/register",
    methods=["POST"]
)
def api_register():

    data = request.get_json() or {}

    username = (
        data.get("username") or ""
    ).strip()

    password = (
        data.get("password") or ""
    ).strip()

    if not username or not password:

        return jsonify({
            "success": False,
            "message": "Campos vazios"
        })

    password_hash = generate_password_hash(
        password
    )

    try:

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
            INSERT INTO users
            (username, password, plan)
            VALUES (?, ?, ?)
            """, (
                username,
                password_hash,
                "free"
            ))

            conn.commit()

        return jsonify({
            "success": True
        })

    except sqlite3.IntegrityError:

        return jsonify({
            "success": False,
            "message": "Usuário já existe"
        })

    except Exception as e:

        print(
            "ERRO REGISTER:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "message": "Erro interno ao criar conta."
        })


# =========================================================
# LOGIN
# =========================================================

@app.route(
    "/api/login",
    methods=["POST"]
)
def api_login():

    data = request.get_json() or {}

    username = (
        data.get("username") or ""
    ).strip()

    password = (
        data.get("password") or ""
    ).strip()

    if not username or not password:

        return jsonify({
            "success": False,
            "message": "Preencha usuário e senha."
        })

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
        SELECT
            id,
            username,
            password,
            plan
        FROM users
        WHERE username=?
        """, (
            username,
        ))

        user = cursor.fetchone()

        if not user:

            return jsonify({
                "success": False,
                "message": "Login inválido"
            })

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

            if user["password"] == password:

                senha_correta = True

                nova_hash = generate_password_hash(
                    password
                )

                cursor.execute("""
                UPDATE users
                SET password=?
                WHERE id=?
                """, (
                    nova_hash,
                    user["id"]
                ))

                conn.commit()

        if not senha_correta:

            return jsonify({
                "success": False,
                "message": "Login inválido"
            })

        session["user"] = user["username"]

        session["plan"] = (
            user["plan"]
            or "free"
        )

        conversation_id = criar_conversa(
            username,
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


# =========================================================
# UPLOAD DE ARQUIVO
# =========================================================

@app.route(
    "/upload",
    methods=["POST"]
)
def upload():

    if "user" not in session:

        return jsonify({
            "success": False,
            "message": "Faça login primeiro."
        }), 401

    if "file" not in request.files:

        return jsonify({
            "success": False,
            "message": "Nenhum arquivo enviado."
        }), 400

    arquivo = request.files["file"]

    if not arquivo or not arquivo.filename:

        return jsonify({
            "success": False,
            "message": "Arquivo inválido."
        }), 400

    nome_original = arquivo.filename

    nome_seguro = secure_filename(
        nome_original
    )

    if not nome_seguro:

        return jsonify({
            "success": False,
            "message": "Nome de arquivo inválido."
        }), 400

    eh_imagem = arquivo_e_imagem(
        nome_seguro
    )

    eh_texto = arquivo_e_texto(
        nome_seguro
    )

    if not eh_imagem and not eh_texto:

        return jsonify({
            "success": False,
            "message":
                "Tipo de arquivo não permitido."
        }), 400

    conversation_id = conversa_atual()

    # =====================================================
    # NOME ÚNICO
    # =====================================================

    extensao = ""

    if "." in nome_seguro:

        extensao = "." + nome_seguro.rsplit(
            ".",
            1
        )[1].lower()

    nome_salvo = (
        f"{session['user']}_"
        f"{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
        f"{extensao}"
    )

    caminho = os.path.join(
        app.config["UPLOAD_FOLDER"],
        nome_salvo
    )

    try:

        arquivo.save(caminho)

        tamanho = tamanho_arquivo(
            caminho
        )

        mime_type = (
            mimetypes.guess_type(
                nome_original
            )[0]
            or arquivo.mimetype
            or "application/octet-stream"
        )

        # =================================================
        # SALVA NO BANCO
        # =================================================

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
            INSERT INTO attachments
            (
                conversation_id,
                username,
                original_name,
                stored_name,
                file_type,
                file_size
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """, (
                conversation_id,
                session["user"],
                nome_original,
                nome_salvo,
                mime_type,
                tamanho
            ))

            attachment_id = cursor.lastrowid

            conn.commit()

        # =================================================
        # ARQUIVO DE TEXTO/CÓDIGO
        # =================================================

        conteudo = None

        if eh_texto:

            try:

                with open(
                    caminho,
                    "r",
                    encoding="utf-8",
                    errors="ignore"
                ) as f:

                    conteudo = f.read()

                # Evita mandar arquivos gigantes
                conteudo = conteudo[:50000]

            except Exception as e:

                print(
                    "ERRO AO LER ARQUIVO:",
                    repr(e)
                )

        return jsonify({

            "success": True,

            "attachment_id":
                attachment_id,

            "conversation_id":
                conversation_id,

            "filename":
                nome_original,

            "stored_name":
                nome_salvo,

            "mime_type":
                mime_type,

            "size":
                tamanho,

            "is_image":
                eh_imagem,

            "is_text":
                eh_texto,

            "content":
                conteudo

        })

    except Exception as e:

        print(
            "ERRO UPLOAD:",
            repr(e)
        )

        if os.path.exists(caminho):

            try:
                os.remove(caminho)
            except Exception:
                pass

        return jsonify({
            "success": False,
            "message":
                "Erro ao salvar arquivo."
        }), 500


# =========================================================
# SERVIR UPLOADS
# =========================================================

@app.route(
    "/uploads/<path:filename>"
)
def uploaded_file(filename):

    if "user" not in session:

        return jsonify({
            "success": False,
            "message": "Faça login primeiro."
        }), 401

    caminho_seguro = secure_filename(
        os.path.basename(filename)
    )

    if not caminho_seguro:

        return jsonify({
            "success": False,
            "message": "Arquivo inválido."
        }), 400

    # Só permite acessar arquivos
    # pertencentes ao usuário atual

    prefixo = f"{session['user']}_"

    if not caminho_seguro.startswith(prefixo):

        return jsonify({
            "success": False,
            "message": "Acesso negado."
        }), 403

    return send_from_directory(
        app.config["UPLOAD_FOLDER"],
        caminho_seguro
    )


# =========================================================
# CHAT
# =========================================================

@app.route(
    "/chat",
    methods=["POST"]
)
def chat():

    if "user" not in session:

        return jsonify({
            "reply": "Faça login primeiro."
        })

    # =====================================================
    # SUPORTA JSON E MULTIPART
    # =====================================================

    arquivo = None

    if request.files:

        arquivo = request.files.get(
            "file"
        )

        mensagem = (
            request.form.get("message")
            or ""
        ).strip()

    else:

        data = request.get_json() or {}

        mensagem = (
            data.get("message")
            or ""
        ).strip()

    if not mensagem and not arquivo:

        return jsonify({
            "reply": "Digite uma mensagem ou envie um arquivo."
        })

    username = session["user"]

    plan = session.get(
        "plan",
        "free"
    )

    conversation_id = conversa_atual()

    # =====================================================
    # LIMITE FREE
    # =====================================================

    with get_db() as conn:

        cursor = conn.cursor()

        if plan == "free":

            cursor.execute("""
            SELECT COUNT(*)
            FROM chat_messages cm
            INNER JOIN conversations c
            ON cm.conversation_id = c.id
            WHERE c.username=?
            AND cm.sender='user'
            AND date(cm.created_at)=date('now')
            """, (
                username,
            ))

            total = cursor.fetchone()[0]

            if total >= 20:

                return jsonify({
                    "reply":
                    "❌ Limite diário do plano FREE atingido (20 mensagens)."
                })

        # =================================================
        # SALVA MENSAGEM
        # =================================================

        texto_salvo = mensagem

        if arquivo:

            texto_salvo += (
                f"\n[Arquivo enviado: "
                f"{arquivo.filename}]"
            )

        cursor.execute("""
        INSERT INTO chat_messages
        (conversation_id, sender, message)
        VALUES (?, ?, ?)
        """, (
            conversation_id,
            "user",
            texto_salvo
        ))

        cursor.execute("""
        UPDATE conversations
        SET updated_at=CURRENT_TIMESTAMP
        WHERE id=?
        """, (
            conversation_id,
        ))

        conn.commit()

        # =================================================
        # HISTÓRICO
        # =================================================

        cursor.execute("""
        SELECT sender, message
        FROM chat_messages
        WHERE conversation_id=?
        ORDER BY id DESC
        LIMIT 12
        """, (
            conversation_id,
        ))

        historico = cursor.fetchall()

    # =====================================================
    # DATA E HORA
    # =====================================================

    agora = datetime.now()

    data_atual = agora.strftime(
        "%d/%m/%Y"
    )

    hora_atual = agora.strftime(
        "%H:%M"
    )

    # =====================================================
    # ESTILO DO PLANO
    # =====================================================

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

    # =====================================================
    # SISTEMA
    # =====================================================

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

==========================
DATA E HORA
==========================

Data atual:

{data_atual}

Hora atual:

{hora_atual}

Use essas informações quando
forem relevantes.

==========================
IDIOMA
==========================

- Responda em português do Brasil
  quando o usuário falar português.
- Se o usuário falar outro idioma,
  responda nesse idioma quando apropriado.

==========================
ENTENDIMENTO
==========================

Entenda mensagens informais,
abreviações, erros de digitação
e frases curtas.

Não critique erros de escrita.

==========================
CONTEXTO
==========================

Use as mensagens anteriores
da conversa para entender
referências como "ele", "isso",
"aquilo" etc.

==========================
ARQUIVOS
==========================

O usuário pode enviar imagens
e arquivos de texto ou código.

Quando receber uma imagem,
analise visualmente o conteúdo
e responda de acordo com a pergunta.

Quando receber código ou texto,
analise o conteúdo fornecido.

Não invente conteúdo que não
esteja presente no arquivo.

==========================
RESPOSTAS
==========================

Responda diretamente.

Não repita a pergunta
desnecessariamente.

Não fique enrolando.

Se a pergunta for simples,
responda simplesmente.

Se for complexa,
explique de maneira organizada.

==========================
FORMATAÇÃO
==========================

Use Markdown quando fizer sentido.

Pode utilizar:

**Negrito**

- Tópicos

1. Passo um
2. Passo dois

### Título

Use parágrafos curtos.

==========================
PRECISÃO
==========================

Nunca invente conscientemente
datas, números, nomes,
estatísticas ou informações.

Se não souber algo,
diga claramente.

==========================
CÓDIGO
==========================

Quando o usuário pedir código:

- entregue código funcional;
- preserve a estrutura existente
  quando solicitado;
- não remova funcionalidades
  sem motivo;
- entregue arquivos completos
  quando solicitado.

==========================
ESTUDOS
==========================

Explique de forma simples,
progressiva e com exemplos
quando isso ajudar.

==========================
ESTILO
==========================

Seja:

- inteligente;
- natural;
- educado;
- claro;
- útil;
- direto;
- organizado.

==========================
PLANO
==========================

{estilo}
"""
        }
    ]

    # =====================================================
    # HISTÓRICO
    # =====================================================

    for item in reversed(historico):

        role = (
            "assistant"
            if item["sender"] == "bot"
            else "user"
        )

        mensagens_ia.append({

            "role": role,

            "content": item["message"]

        })

    # =====================================================
    # PROCESSAMENTO DO ARQUIVO
    # =====================================================

    imagem_base64 = None

    if arquivo:

        nome_original = arquivo.filename

        nome_seguro = secure_filename(
            nome_original
        )

        if not nome_seguro:

            return jsonify({
                "reply":
                    "Nome de arquivo inválido."
            })

        eh_imagem = arquivo_e_imagem(
            nome_seguro
        )

        eh_texto = arquivo_e_texto(
            nome_seguro
        )

        if not eh_imagem and not eh_texto:

            return jsonify({
                "reply":
                    "Esse tipo de arquivo não é permitido."
            })

        try:

            dados = arquivo.read()

            if len(dados) > 10 * 1024 * 1024:

                return jsonify({
                    "reply":
                        "O arquivo é muito grande. O limite é 10 MB."
                })

            if eh_texto:

                conteudo = dados.decode(
                    "utf-8",
                    errors="ignore"
                )

                conteudo = conteudo[:50000]

                mensagens_ia.append({

                    "role": "user",

                    "content":
                        f"""
O usuário enviou o arquivo:

{nome_original}

Conteúdo do arquivo:

{conteudo}
"""
                })

            elif eh_imagem:

                mime_type = (
                    mimetypes.guess_type(
                        nome_original
                    )[0]
                    or "image/jpeg"
                )

                imagem_base64 = base64.b64encode(
                    dados
                ).decode("utf-8")

                mensagens_ia.append({

                    "role": "user",

                    "content": [

                        {
                            "type": "text",

                            "text":
                                mensagem
                                or
                                "Analise esta imagem."
                        },

                        {
                            "type": "image_url",

                            "image_url": {
                                "url":
                                    f"data:{mime_type};base64,{imagem_base64}"
                            }
                        }

                    ]

                })

        except Exception as e:

            print(
                "ERRO PROCESSANDO ARQUIVO:",
                repr(e)
            )

            return jsonify({
                "reply":
                    "Não consegui processar esse arquivo."
            })

    # =====================================================
    # MENSAGEM NORMAL
    # =====================================================

    if not arquivo and mensagem:

        mensagens_ia.append({

            "role": "user",

            "content": mensagem

        })

    # =====================================================
    # GROQ
    # =====================================================

    try:

        # Modelo normal
        modelo = "openai/gpt-oss-120b"

        # Para imagens usamos um modelo multimodal.
        # Caso o modelo não esteja disponível na sua
        # conta/região, o erro aparecerá no log do Render.
        if imagem_base64:

            modelo = "meta-llama/llama-4-scout-17b-16e-instruct"

        resposta = client.chat.completions.create(

            model=modelo,

            messages=mensagens_ia,

            temperature=0.7,

            max_completion_tokens=1024
        )

        texto = (
            resposta
            .choices[0]
            .message
            .content
        )

    except Exception as e:

        print(
            "ERRO GROQ:",
            repr(e)
        )

        return jsonify({
            "reply":
                f"Erro IA: {str(e)}"
        })

    # =====================================================
    # SALVA RESPOSTA
    # =====================================================

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
        INSERT INTO chat_messages
        (conversation_id, sender, message)
        VALUES (?, ?, ?)
        """, (
            conversation_id,
            "bot",
            texto
        ))

        cursor.execute("""
        UPDATE conversations
        SET updated_at=CURRENT_TIMESTAMP
        WHERE id=?
        """, (
            conversation_id,
        ))

        conn.commit()

    return jsonify({

        "reply": texto,

        "conversation_id":
            conversation_id

    })


# =========================================================
# LISTAR CONVERSAS
# =========================================================

@app.route("/conversations")
def conversations():

    if "user" not in session:

        return jsonify([])

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
        SELECT
            id,
            title,
            created_at,
            updated_at
        FROM conversations
        WHERE username=?
        ORDER BY updated_at DESC
        """, (
            session["user"],
        ))

        lista = cursor.fetchall()

    return jsonify([

        {
            "id": item["id"],
            "title": item["title"],
            "created_at": item["created_at"],
            "updated_at": item["updated_at"]
        }

        for item in lista

    ])


# =========================================================
# ABRIR CONVERSA
# =========================================================

@app.route(
    "/conversation/<int:conversation_id>"
)
def open_conversation(
    conversation_id
):

    if "user" not in session:

        return jsonify({
            "success": False,
            "message": "Faça login primeiro."
        }), 401

    if not verificar_conversa(
        session["user"],
        conversation_id
    ):

        return jsonify({
            "success": False,
            "message": "Conversa não encontrada."
        }), 404

    session["conversation_id"] = (
        conversation_id
    )

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
        SELECT sender, message, created_at
        FROM chat_messages
        WHERE conversation_id=?
        ORDER BY id ASC
        """, (
            conversation_id,
        ))

        mensagens = cursor.fetchall()

        cursor.execute("""
        SELECT title
        FROM conversations
        WHERE id=? AND username=?
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

        "messages": [

            {
                "sender": item["sender"],
                "message": item["message"],
                "created_at": item["created_at"]
            }

            for item in mensagens

        ]

    })


# =========================================================
# HISTORY
# =========================================================

@app.route("/history")
def history():

    if "user" not in session:

        return jsonify([])

    conversation_id = (
        conversa_atual()
    )

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
        SELECT sender, message, created_at
        FROM chat_messages
        WHERE conversation_id=?
        ORDER BY id ASC
        """, (
            conversation_id,
        ))

        mensagens = cursor.fetchall()

    return jsonify([

        {
            "sender": item["sender"],
            "message": item["message"],
            "created_at": item["created_at"]
        }

        for item in mensagens

    ])


# =========================================================
# NOVA CONVERSA
# =========================================================

@app.route(
    "/new_chat",
    methods=["POST"]
)
def new_chat():

    if "user" not in session:

        return jsonify({
            "success": False,
            "message": "Faça login primeiro."
        })

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


# =========================================================
# RENOMEAR CONVERSA
# =========================================================

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
            "message": "Faça login primeiro."
        }), 401

    if not verificar_conversa(
        session["user"],
        conversation_id
    ):

        return jsonify({
            "success": False,
            "message": "Conversa não encontrada."
        }), 404

    data = request.get_json() or {}

    title = (
        data.get("title") or ""
    ).strip()

    if not title:

        return jsonify({
            "success": False,
            "message":
                "Digite um nome para a conversa."
        })

    title = title[:100]

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
        UPDATE conversations
        SET title=?
        WHERE id=? AND username=?
        """, (
            title,
            conversation_id,
            session["user"]
        ))

        conn.commit()

    return jsonify({
        "success": True,
        "title": title
    })


# =========================================================
# EXCLUIR CONVERSA
# =========================================================

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
            "message": "Faça login primeiro."
        }), 401

    if not verificar_conversa(
        session["user"],
        conversation_id
    ):

        return jsonify({
            "success": False,
            "message": "Conversa não encontrada."
        }), 404

    with get_db() as conn:

        cursor = conn.cursor()

        # =================================================
        # REMOVE ANEXOS
        # =================================================

        cursor.execute("""
        SELECT stored_name
        FROM attachments
        WHERE conversation_id=?
        AND username=?
        """, (
            conversation_id,
            session["user"]
        ))

        anexos = cursor.fetchall()

        for anexo in anexos:

            caminho = os.path.join(
                app.config["UPLOAD_FOLDER"],
                anexo["stored_name"]
            )

            if os.path.exists(caminho):

                try:
                    os.remove(caminho)
                except Exception:
                    pass

        cursor.execute("""
        DELETE FROM attachments
        WHERE conversation_id=?
        AND username=?
        """, (
            conversation_id,
            session["user"]
        ))

        # =================================================
        # REMOVE MENSAGENS
        # =================================================

        cursor.execute("""
        DELETE FROM chat_messages
        WHERE conversation_id=?
        """, (
            conversation_id,
        ))

        # =================================================
        # REMOVE CONVERSA
        # =================================================

        cursor.execute("""
        DELETE FROM conversations
        WHERE id=? AND username=?
        """, (
            conversation_id,
            session["user"]
        ))

        conn.commit()

    if (
        session.get("conversation_id")
        == conversation_id
    ):

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


# =========================================================
# ERRO DE ARQUIVO GRANDE
# =========================================================

@app.errorhandler(413)
def arquivo_muito_grande(error):

    return jsonify({
        "success": False,
        "message":
            "O arquivo é muito grande. O limite é 10 MB."
    }), 413


# =========================================================
# START
# =========================================================

if __name__ == "__main__":

    port = int(
        os.environ.get(
            "PORT",
            5000
        )
    )

    app.run(
        host="0.0.0.0",
        port=port
    )
