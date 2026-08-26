````python
import os
import sqlite3
import base64
from datetime import datetime

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
# CONFIGURAÇÕES DE ARQUIVOS
# ==========================

MAX_FILE_SIZE = 10 * 1024 * 1024

ALLOWED_EXTENSIONS = {
    "txt",
    "pdf",
    "doc",
    "docx",
    "csv",
    "json",
    "py",
    "js",
    "html",
    "css",
    "java",
    "c",
    "cpp",
    "h",
    "hpp",
    "md",
    "xml",
    "sql",
    "zip",
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif"
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

    conn.execute("PRAGMA journal_mode=WAL")

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

        # ==========================
        # ARQUIVOS DAS CONVERSAS
        # ==========================

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            message_id INTEGER,
            username TEXT NOT NULL,
            filename TEXT NOT NULL,
            mimetype TEXT,
            size INTEGER DEFAULT 0,
            content TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id)
            REFERENCES conversations(id),
            FOREIGN KEY (message_id)
            REFERENCES chat_messages(id)
        )
        """)

        conn.commit()

        # ==========================
        # MIGRAÇÃO DO HISTÓRICO
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

    session["conversation_id"] = conversation_id

    return conversation_id


def arquivo_permitido(filename):

    if not filename:
        return False

    if "." not in filename:
        return False

    extensao = filename.rsplit(
        ".",
        1
    )[1].lower()

    return extensao in ALLOWED_EXTENSIONS


def ler_arquivo_texto(file):

    try:

        dados = file.read()

        if not dados:
            return ""

        return dados.decode(
            "utf-8",
            errors="replace"
        )

    except Exception as e:

        print(
            "ERRO AO LER ARQUIVO:",
            repr(e)
        )

        return ""


def preparar_arquivo(file):

    filename = (
        file.filename or
        "arquivo"
    )

    if not arquivo_permitido(filename):

        raise ValueError(
            "Tipo de arquivo não permitido."
        )

    file.seek(0, 2)

    tamanho = file.tell()

    file.seek(0)

    if tamanho > MAX_FILE_SIZE:

        raise ValueError(
            "O arquivo é muito grande. "
            "O limite é 10 MB."
        )

    mimetype = (
        file.mimetype or
        "application/octet-stream"
    )

    extensao = filename.rsplit(
        ".",
        1
    )[1].lower()

    texto = ""

    tipos_texto = {
        "txt",
        "csv",
        "json",
        "py",
        "js",
        "html",
        "css",
        "java",
        "c",
        "cpp",
        "h",
        "hpp",
        "md",
        "xml",
        "sql"
    }

    if extensao in tipos_texto:

        texto = ler_arquivo_texto(file)

    else:

        dados = file.read()

        if dados:

            texto = (
                f"[Arquivo anexado: {filename}]\n"
                f"Tipo: {mimetype}\n"
                f"Tamanho: {tamanho} bytes"
            )

    return {
        "filename": filename,
        "mimetype": mimetype,
        "size": tamanho,
        "content": texto
    }


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
            "message": "Erro interno ao criar conta."
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
            user["plan"] or
            "free"
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
# CHAT
# ==========================

@app.route(
    "/chat",
    methods=["POST"]
)
def chat():

    if "user" not in session:

        return jsonify({
            "reply": "Faça login primeiro."
        }), 401

    mensagem = ""

    arquivo_info = None

    # ==========================
    # JSON
    # ==========================

    if request.is_json:

        data = request.get_json() or {}

        mensagem = (
            data.get("message") or ""
        ).strip()

    # ==========================
    # FORM DATA
    # ==========================

    else:

        mensagem = (
            request.form.get("message") or ""
        ).strip()

        arquivo = request.files.get(
            "file"
        )

        if arquivo and arquivo.filename:

            try:

                arquivo_info = preparar_arquivo(
                    arquivo
                )

            except ValueError as e:

                return jsonify({
                    "reply": str(e)
                }), 400

            except Exception as e:

                print(
                    "ERRO ARQUIVO:",
                    repr(e)
                )

                return jsonify({
                    "reply":
                    "Não foi possível processar o arquivo."
                }), 400

    if not mensagem and not arquivo_info:

        return jsonify({
            "reply": "Digite uma mensagem ou selecione um arquivo."
        })

    username = session["user"]

    plan = session.get(
        "plan",
        "free"
    )

    conversation_id = conversa_atual()

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
        # TEXTO PARA A IA
        # ==========================

        mensagem_ia = mensagem

        if arquivo_info:

            mensagem_arquivo = (
                "\n\n"
                "📎 ARQUIVO ANEXADO\n"
                f"Nome: {arquivo_info['filename']}\n"
                f"Tipo: {arquivo_info['mimetype']}\n"
                f"Tamanho: {arquivo_info['size']} bytes\n"
            )

            if arquivo_info["content"]:

                conteudo = arquivo_info["content"]

                # Evita mandar arquivos de texto
                # gigantes para a API.

                conteudo = conteudo[:30000]

                mensagem_arquivo += (
                    "\nConteúdo do arquivo:\n"
                    "```text\n"
                    f"{conteudo}\n"
                    "```\n"
                )

            mensagem_ia += mensagem_arquivo

        # ==========================
        # SALVA MENSAGEM
        # ==========================

        cursor.execute("""
        INSERT INTO chat_messages
        (conversation_id, sender, message)
        VALUES (?, ?, ?)
        """, (
            conversation_id,
            "user",
            mensagem or
            f"📎 {arquivo_info['filename']}"
        ))

        message_id = cursor.lastrowid

        # ==========================
        # SALVA ARQUIVO
        # ==========================

        if arquivo_info:

            cursor.execute("""
            INSERT INTO chat_files
            (
                conversation_id,
                message_id,
                username,
                filename,
                mimetype,
                size,
                content
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                conversation_id,
                message_id,
                username,
                arquivo_info["filename"],
                arquivo_info["mimetype"],
                arquivo_info["size"],
                arquivo_info["content"][:30000]
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
    # ESTILO DO PLANO
    # ==========================

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

    # ==========================
    # PERSONALIDADE
    # ==========================

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
criar ideias, escrever textos,
analisar conteúdos e conversar.

==========================
DATA E HORA
==========================

A data atual é:

{data_atual}

A hora atual é:

{hora_atual}

Use essas informações quando
forem relevantes.

Não invente a data atual.

==========================
IDIOMA
==========================

Responda em português do Brasil
quando o usuário falar português.

Se o usuário falar outro idioma,
responda nesse idioma quando apropriado.

==========================
ARQUIVOS
==========================

O usuário pode enviar arquivos
junto com mensagens.

Quando houver conteúdo de arquivo
disponível no contexto:

- analise o conteúdo;
- responda sobre o arquivo;
- explique o que encontrou;
- não invente informações que não
  estejam disponíveis.

Se o arquivo for uma imagem ou um
formato que você não consiga analisar
diretamente, diga claramente essa
limitação.

==========================
CONTEXTO
==========================

Use as mensagens anteriores da conversa
para entender referências como:

"ele"
"isso"
"aquilo"
"o arquivo"
"essa parte"

Não peça esclarecimento se o contexto
já permitir entender o pedido.

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
explicadas de maneira organizada.

==========================
FORMATAÇÃO
==========================

Use Markdown quando fizer sentido.

Você pode usar:

**negrito**

- tópicos

1. listas numeradas

### títulos

Use parágrafos curtos.

Não transforme absolutamente
todas as respostas em listas.

==========================
PRECISÃO
==========================

Nunca invente conscientemente:

- datas;
- números;
- nomes;
- estatísticas;
- fontes;
- links;
- informações.

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
- entregue o arquivo inteiro
  quando solicitado.

==========================
ESTUDOS
==========================

Explique de maneira simples,
com exemplos quando ajudarem.

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

Não fique repetindo
"como IA".

Não repita "sou o PedroGPT"
sem necessidade.

==========================
PLANO
==========================

{estilo}

==========================
REGRA PRINCIPAL
==========================

Antes de responder:

1. Entenda a pergunta.
2. Analise o contexto.
3. Analise o arquivo, se houver.
4. Verifique se a data é relevante.
5. Escolha a melhor forma de responder.
6. Evite informações inventadas.
"""
        }
    ]

    # ==========================
    # HISTÓRICO
    # ==========================

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

    # ==========================
    # GROQ
    # ==========================

    try:

        resposta = client.chat.completions.create(

            model="openai/gpt-oss-120b",

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
            "reply": f"Erro IA: {str(e)}"
        }), 500

    # ==========================
    # SALVA RESPOSTA
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
                    arquivo_info["filename"],
                "type":
                    arquivo_info["mimetype"],
                "size":
                    arquivo_info["size"]
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
            "id": item["id"],
            "title": item["title"],
            "created_at": item["created_at"],
            "updated_at": item["updated_at"]
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
            "sender": item["sender"],
            "message": item["message"],
            "created_at": item["created_at"]
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

        cursor.execute("""
        DELETE FROM chat_files
        WHERE conversation_id=?
        """, (
            conversation_id,
        ))

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
````

### Git

```bash
git add .
git commit -m "Adiciona suporte a arquivos no PedroGPT"
git push
```
