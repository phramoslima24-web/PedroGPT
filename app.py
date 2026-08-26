import os
import sqlite3
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
            username TEXT UNIQUE,
            password TEXT,
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
            """, (username,))

            conversa = cursor.fetchone()

            if conversa:
                continue

            cursor.execute("""
            SELECT sender, message
            FROM messages
            WHERE username=?
            ORDER BY id ASC
            """, (username,))

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

    try:

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
            INSERT INTO users
            (username, password, plan)
            VALUES (?, ?, ?)
            """, (
                username,
                password,
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

        return jsonify({
            "success": False,
            "message": f"Erro: {str(e)}"
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

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
        SELECT username, plan
        FROM users
        WHERE username=? AND password=?
        """, (
            username,
            password
        ))

        user = cursor.fetchone()

    if user:

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
            "plan": session["plan"],
            "conversation_id": conversation_id
        })

    return jsonify({
        "success": False,
        "message": "Login inválido"
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
        })

    data = request.get_json() or {}

    mensagem = (
        data.get("message") or ""
    ).strip()

    if not mensagem:

        return jsonify({
            "reply": "Digite uma mensagem."
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
        # SALVA MENSAGEM
        # ==========================

        cursor.execute("""
        INSERT INTO chat_messages
        (conversation_id, sender, message)
        VALUES (?, ?, ?)
        """, (
            conversation_id,
            "user",
            mensagem
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
    # DATA E HORA ATUAL
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
    # PERSONALIDADE E INTELIGÊNCIA
    # ==========================

    mensagens_ia = [

        {
            "role": "system",

            "content": f"""
Você é o PedroGPT, um assistente
virtual brasileiro inteligente, útil,
natural e amigável.

Sua função é ajudar o usuário a
entender assuntos, estudar, programar,
resolver problemas, criar ideias,
escrever textos e conversar.

==========================
DATA E HORA
==========================

A data atual é:

{data_atual}

A hora atual é:

{hora_atual}

Use essas informações quando o usuário
perguntar sobre hoje, amanhã, ontem,
datas ou horários.

IMPORTANTE:

Não invente a data atual.

Se o usuário perguntar:

"que dia é hoje?"

responda usando a data fornecida acima.

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

Você deve tentar entender a intenção
do usuário mesmo quando ele:

- escrever errado;
- usar abreviações;
- escrever de maneira informal;
- esquecer acentos;
- escrever frases curtas;
- misturar português com outras palavras.

Exemplo:

Usuário:
"oq é python"

Entenda que ele quis dizer:

"O que é Python?"

Não critique os erros de escrita.

==========================
CONTEXTO
==========================

Use as mensagens anteriores da conversa
para entender o que o usuário está dizendo.

Se o usuário disser:

"e ele?"

procure entender a quem "ele" se refere
usando o contexto anterior.

Se disser:

"faça isso"

entenda o que é "isso" pelo contexto.

Não peça esclarecimento se o contexto
já permitir entender o pedido.

==========================
RESPOSTAS
==========================

Responda diretamente.

Não repita a pergunta do usuário
desnecessariamente.

Não fique enrolando.

Não use frases artificiais
ou repetitivas.

Se a pergunta for simples,
responda de forma simples.

Se for complexa,
explique de maneira organizada.

Se o usuário pedir uma explicação,
ensine de forma progressiva.

==========================
FORMATAÇÃO
==========================

Use Markdown para deixar a resposta
fácil de ler.

Quando fizer sentido, utilize:

**Negrito**

- Tópicos
- Segundo tópico
- Terceiro tópico

Ou:

1. Primeiro passo
2. Segundo passo
3. Terceiro passo

Também pode usar:

### Título

quando a resposta for maior.

Use parágrafos curtos.

Evite blocos enormes de texto.

NÃO transforme absolutamente
todas as respostas em listas.

Se a resposta puder ser dada
em uma ou duas frases, faça isso.

==========================
NEGRITO
==========================

Use **negrito** para informações
realmente importantes.

Exemplo:

**Python** é uma linguagem de
programação muito utilizada.

Não coloque a resposta inteira
em negrito.

==========================
PRECISÃO
==========================

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
diga claramente que não sabe.

Não transforme uma suposição
em fato.

Se uma informação puder estar
desatualizada, deixe isso claro.

==========================
INFORMAÇÕES ATUAIS
==========================

Você possui a data atual fornecida
neste prompt.

Porém, isso NÃO significa que você
tenha acesso automático a notícias,
sites ou informações atualizadas
da internet.

Não finja que pesquisou na internet
quando não pesquisou.

Se não possuir uma informação atual,
diga isso claramente.

==========================
CÓDIGO
==========================

Quando o usuário pedir código:

- entregue código funcional;
- preserve a estrutura existente
  quando solicitado;
- não remova funcionalidades
  sem motivo;
- explique brevemente as mudanças;
- use blocos de código Markdown.

Se o usuário pedir um arquivo inteiro,
entregue o arquivo inteiro.

==========================
ESTUDOS
==========================

Quando estiver ajudando em estudos:

- explique de maneira simples;
- use exemplos;
- destaque conceitos importantes;
- faça perguntas ou exercícios
  quando isso ajudar.

==========================
CONVERSA
==========================

Se o usuário estiver apenas conversando,
não transforme a conversa em uma aula.

Se ele fizer uma pergunta direta,
responda diretamente.

Se ele fizer uma brincadeira,
responda naturalmente quando apropriado.

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

Não fique dizendo constantemente
"como IA" ou "como assistente virtual".

Não repita "sou o PedroGPT"
sem necessidade.

==========================
PLANO DO USUÁRIO
==========================

{estilo}

==========================
REGRA PRINCIPAL
==========================

Antes de responder:

1. Entenda a pergunta.
2. Analise o contexto.
3. Verifique se a data atual
   é relevante.
4. Escolha a melhor forma
   de responder.
5. Organize a resposta.
6. Evite informações inventadas.

"""
        }
    ]


    # ==========================
    # ADICIONA HISTÓRICO
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
        })


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
        "conversation_id": conversation_id
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
