```python
import os
import sqlite3
from datetime import datetime
from pathlib import Path

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

from werkzeug.security import (
    generate_password_hash,
    check_password_hash
)

from groq import Groq


app = Flask(__name__)


# ==========================
# CONFIGURAÇÕES
# ==========================

app.secret_key = os.getenv(
    "FLASK_SECRET_KEY",
    "pedrogpt_secret_key"
)

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)


# ==========================
# UPLOADS
# ==========================

UPLOAD_FOLDER = Path("uploads")

UPLOAD_FOLDER.mkdir(
    exist_ok=True
)

app.config["UPLOAD_FOLDER"] = str(
    UPLOAD_FOLDER
)

MAX_FILE_SIZE = 10 * 1024 * 1024

app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE


ALLOWED_EXTENSIONS = {
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "txt",
    "pdf",
    "doc",
    "docx",
    "csv"
}


# ==========================
# VERSION
# ==========================

@app.route("/version")
def version():

    return {
        "version": "1.2",
        "apk_url": "https://drive.google.com/file/d/1mdpeCrIJNcU2DlHLabjgh17zvM2ha703/view?usp=drive_link"
    }


# ==========================
# BANCO DE DADOS
# ==========================

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


        # ==========================
        # USUÁRIOS
        # ==========================

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            plan TEXT DEFAULT 'free'
        )
        """)


        # ==========================
        # MENSAGENS ANTIGAS
        # ==========================

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            sender TEXT,
            message TEXT
        )
        """)


        # ==========================
        # CONVERSAS
        # ==========================

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            title TEXT DEFAULT 'Nova conversa',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)


        # ==========================
        # MENSAGENS DAS CONVERSAS
        # ==========================

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


        conn.commit()


        # ==========================
        # MIGRAÇÃO
        # ==========================

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


# ==========================
# FUNÇÕES AUXILIARES
# ==========================

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


    session["conversation_id"] = (
        conversation_id
    )


    return conversation_id


def arquivo_permitido(nome):

    if "." not in nome:
        return False

    extensao = (
        nome
        .rsplit(".", 1)[1]
        .lower()
    )

    return extensao in ALLOWED_EXTENSIONS


# ==========================
# PÁGINAS
# ==========================

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


# ==========================
# REGISTER
# ==========================

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
            "message":
            "Erro interno ao criar conta."
        })


# ==========================
# LOGIN
# ==========================

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
            "message":
            "Preencha usuário e senha."
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
                "message":
                "Login inválido"
            })


        senha_correta = False


        try:

            senha_correta = check_password_hash(
                user["password"],
                password
            )

        except Exception:

            senha_correta = False


        # ==========================
        # MIGRAÇÃO DE SENHA ANTIGA
        # ==========================

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
                "message":
                "Login inválido"
            })


        session["user"] = (
            user["username"]
        )

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


# ==========================
# UPLOADS
# ==========================

@app.route(
    "/uploads/<path:filename>"
)
def servir_upload(filename):

    if "user" not in session:

        return jsonify({
            "success": False,
            "message":
            "Faça login primeiro."
        }), 401


    return send_from_directory(
        app.config["UPLOAD_FOLDER"],
        filename
    )


# ==========================
# CHAT
# ==========================

@app.route(
    "/chat",
    methods=["POST"]
)
def chat():

    if "user" not in session:

        return jsonify({
            "reply":
            "Faça login primeiro."
        }), 401


    # ==========================
    # SUPORTE A JSON
    # E FORM-DATA
    # ==========================

    if request.content_type and (
        request.content_type.startswith(
            "application/json"
        )
    ):

        data = (
            request.get_json()
            or {}
        )

        mensagem = (
            data.get("message")
            or ""
        ).strip()

        arquivo = None

    else:

        mensagem = (
            request.form.get(
                "message"
            )
            or ""
        ).strip()

        arquivo = request.files.get(
            "file"
        )


    username = session["user"]


    plan = session.get(
        "plan",
        "free"
    )


    conversation_id = (
        conversa_atual()
    )


    # ==========================
    # ARQUIVO
    # ==========================

    arquivo_info = None


    if arquivo and arquivo.filename:

        nome_original = (
            arquivo.filename
        )


        if not arquivo_permitido(
            nome_original
        ):

            return jsonify({
                "reply":
                "❌ Tipo de arquivo não permitido."
            }), 400


        extensao = (
            nome_original
            .rsplit(".", 1)[1]
            .lower()
        )


        nome_seguro = (
            f"{username}_"
            f"{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
            f".{extensao}"
        )


        caminho = (
            UPLOAD_FOLDER /
            nome_seguro
        )


        try:

            arquivo.save(
                str(caminho)
            )

        except Exception as e:

            print(
                "ERRO UPLOAD:",
                repr(e)
            )

            return jsonify({
                "reply":
                "❌ Não foi possível salvar o arquivo."
            }), 500


        arquivo_info = {
            "nome": nome_original,
            "caminho": str(caminho),
            "extensao": extensao,
            "tipo": arquivo.mimetype
        }


    # ==========================
    # VALIDAÇÃO
    # ==========================

    if not mensagem and not arquivo_info:

        return jsonify({
            "reply":
            "Digite uma mensagem ou selecione um arquivo."
        })


    # ==========================
    # LIMITE FREE
    # ==========================

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


        # ==========================
        # TEXTO SALVO
        # ==========================

        mensagem_salva = mensagem


        if arquivo_info:

            mensagem_salva += (
                "\n\n📎 Arquivo enviado: "
                + arquivo_info["nome"]
            )


        cursor.execute("""
        INSERT INTO chat_messages
        (conversation_id, sender, message)
        VALUES (?, ?, ?)
        """, (
            conversation_id,
            "user",
            mensagem_salva
        ))


        cursor.execute("""
        UPDATE conversations
        SET updated_at=CURRENT_TIMESTAMP
        WHERE id=?
        """, (
            conversation_id,
        ))


        conn.commit()


        # ==========================
        # HISTÓRICO
        # ==========================

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


    # ==========================
    # DATA E HORA
    # ==========================

    agora = datetime.now()


    data_atual = agora.strftime(
        "%d/%m/%Y"
    )


    hora_atual = agora.strftime(
        "%H:%M"
    )


    # ==========================
    # ESTILO
    # ==========================

    if plan == "free":

        estilo = """
Responda de forma clara, útil e objetiva.

Prefira respostas relativamente curtas,
mas explique o necessário.

Mantenha boa qualidade e organização.
"""

    else:

        estilo = """
Responda de forma completa, detalhada
e inteligente.

Quando necessário, explique passo a passo.

Use exemplos quando ajudarem.
"""


    # ==========================
    # INFORMAÇÃO DO ARQUIVO
    # ==========================

    contexto_arquivo = ""


    if arquivo_info:

        contexto_arquivo = f"""
==========================
ARQUIVO ENVIADO
==========================

O usuário enviou um arquivo.

Nome:
{arquivo_info["nome"]}

Tipo:
{arquivo_info["tipo"]}

Extensão:
{arquivo_info["extensao"]}

O arquivo foi recebido pelo servidor.

Se você não conseguir analisar
o conteúdo diretamente, seja honesto
e diga isso ao usuário.

Não invente o conteúdo do arquivo.
"""


    # ==========================
    # PERSONALIDADE
    # ==========================

    mensagens_ia = [

        {
            "role": "system",

            "content": f"""
Você é o PedroGPT, um assistente
virtual brasileiro inteligente,
útil, natural e amigável.

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

Nunca invente a data atual.

==========================
IDIOMA
==========================

Responda em português do Brasil
quando o usuário falar português.

Se o usuário falar outro idioma,
responda nesse idioma quando
apropriado.

==========================
ENTENDIMENTO
==========================

Entenda mensagens mesmo quando
o usuário:

- escrever errado;
- usar abreviações;
- esquecer acentos;
- escrever informalmente;
- misturar idiomas.

Não critique erros de escrita.

==========================
CONTEXTO
==========================

Use as mensagens anteriores
para entender referências.

Se o usuário disser:

"e ele?"

procure entender pelo contexto.

Não peça esclarecimento quando
o contexto já permitir entender.

==========================
RESPOSTAS
==========================

Responda diretamente.

Não repita a pergunta
desnecessariamente.

Não fique enrolando.

Perguntas simples devem receber
respostas simples.

Perguntas complexas devem ser
explicadas de forma organizada.

==========================
FORMATAÇÃO
==========================

Use Markdown quando ajudar.

Você pode utilizar:

**negrito**

- tópicos

1. passos

### títulos

Use parágrafos curtos.

Não transforme tudo em listas.

==========================
PRECISÃO
==========================

Nunca invente:

- informações;
- números;
- datas;
- nomes;
- estatísticas;
- fontes;
- links.

Se não souber algo,
diga claramente.

Não transforme suposições
em fatos.

==========================
ARQUIVOS
==========================

O usuário pode enviar:

- imagens;
- PDFs;
- documentos;
- textos;
- arquivos diversos.

Se o conteúdo do arquivo estiver
disponível para você, analise-o.

Se não estiver disponível,
não invente o conteúdo.

Para imagens, descreva apenas
o que realmente conseguir analisar.

Para documentos, não invente
informações que não conseguiu ler.

==========================
CÓDIGO
==========================

Quando o usuário pedir código:

- entregue código funcional;
- preserve a estrutura existente;
- não remova funcionalidades
  sem motivo;
- explique brevemente mudanças;
- entregue o arquivo inteiro
  quando solicitado.

==========================
ESTUDOS
==========================

Explique de maneira simples.

Use exemplos quando ajudarem.

Destaque conceitos importantes.

==========================
CONVERSA
==========================

Se o usuário estiver conversando,
seja natural.

Não transforme tudo em uma aula.

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

Não repita constantemente
que é uma IA.

Não diga "sou o PedroGPT"
sem necessidade.

==========================
PLANO
==========================

{estilo}

{contexto_arquivo}

==========================
REGRA PRINCIPAL
==========================

Antes de responder:

1. Entenda a pergunta.
2. Analise o contexto.
3. Considere o arquivo enviado.
4. Verifique a data quando necessário.
5. Escolha a melhor resposta.
6. Não invente informações.
"""
        }
    ]


    # ==========================
    # HISTÓRICO
    # ==========================

    for item in reversed(
        historico
    ):

        role = (
            "assistant"
            if item["sender"] == "bot"
            else "user"
        )


        mensagens_ia.append({

            "role": role,

            "content":
                item["message"]

        })


    # ==========================
    # SE HOUVER ARQUIVO
    # ==========================

    if arquivo_info:

        mensagens_ia.append({

            "role": "user",

            "content":
                (
                    mensagem
                    or
                    f"Analise o arquivo enviado: "
                    f"{arquivo_info['nome']}"
                )

        })


    # ==========================
    # GROQ
    # ==========================

    try:

        resposta = (
            client
            .chat
            .completions
            .create(

                model=
                    "openai/gpt-oss-120b",

                messages=
                    mensagens_ia,

                temperature=0.7,

                max_completion_tokens=
                    1024

            )
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
        }), 500


    # ==========================
    # SALVAR RESPOSTA
    # ==========================

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
            conversation_id,

        "file": (
            {
                "name":
                    arquivo_info["nome"],

                "type":
                    arquivo_info["tipo"]
            }
            if arquivo_info
            else None
        )

    })


# ==========================
# LISTAR CONVERSAS
# ==========================

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
            "id":
                item["id"],

            "title":
                item["title"],

            "created_at":
                item["created_at"],

            "updated_at":
                item["updated_at"]

        }

        for item in lista

    ])


# ==========================
# ABRIR CONVERSA
# ==========================

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


# ==========================
# HISTORY
# ==========================

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
            "sender":
                item["sender"],

            "message":
                item["message"],

            "created_at":
                item["created_at"]

        }

        for item in mensagens

    ])


# ==========================
# NOVA CONVERSA
# ==========================

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


# ==========================
# RENOMEAR CONVERSA
# ==========================

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


# ==========================
# EXCLUIR CONVERSA
# ==========================

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
        DELETE FROM chat_messages
        WHERE conversation_id=?
        """, (
            conversation_id,
        ))


        cursor.execute("""
        DELETE FROM conversations
        WHERE id=? AND username=?
        """, (
            conversation_id,
            session["user"]
        ))


        conn.commit()


    if (
        session.get(
            "conversation_id"
        )
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


# ==========================
# ERRO DE ARQUIVO GRANDE
# ==========================

@app.errorhandler(413)
def arquivo_muito_grande(error):

    return jsonify({
        "reply":
        "❌ O arquivo é muito grande. O limite é 10 MB."
    }), 413


# ==========================
# START
# ==========================

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
```
