import os
import sqlite3
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from groq import Groq

app = Flask(__name__)
app.secret_key = "pedrogpt_secret_key"

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)

# ==========================
# BANCO DE DADOS
# ==========================

def init_db():
    conn = sqlite3.connect("database.db")
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        sender TEXT,
        message TEXT
    )
    """)

    conn.commit()
    conn.close()

init_db()

# ==========================
# PÁGINAS
# ==========================

@app.route("/")
def home():
    if "user" not in session:
        return redirect(url_for("login"))

    return render_template("index.html", username=session["user"])


@app.route("/login")
def login():
    return render_template("login.html")


@app.route("/register")
def register():
    return render_template("register.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# ==========================
# CADASTRO
# ==========================

@app.route("/api/register", methods=["POST"])
def api_register():

    data = request.get_json()

    username = data["username"]
    password = data["password"]

    try:

        conn = sqlite3.connect("database.db")
        cursor = conn.cursor()

        cursor.execute(
            "INSERT INTO users (username,password) VALUES (?,?)",
            (username, password)
        )

        conn.commit()
        conn.close()

        return jsonify({"success": True})

    except:
        return jsonify({
            "success": False,
            "message": "Usuário já existe."
        })

# ==========================
# LOGIN
# ==========================

@app.route("/api/login", methods=["POST"])
def api_login():

    data = request.get_json()

    username = data["username"]
    password = data["password"]

    conn = sqlite3.connect("database.db")
    cursor = conn.cursor()

    cursor.execute(
        "SELECT * FROM users WHERE username=? AND password=?",
        (username, password)
    )

    user = cursor.fetchone()

    conn.close()

    if user:

        session["user"] = username

        return jsonify({
            "success": True
        })

    return jsonify({
        "success": False,
        "message": "Login inválido."
    })

# ==========================
# CHAT
# ==========================

@app.route("/chat", methods=["POST"])
def chat():

    if "user" not in session:
        return jsonify({
            "reply": "Faça login primeiro."
        })

    try:

        data = request.get_json()

        mensagem = data.get("message", "")

        conn = sqlite3.connect("database.db")
        cursor = conn.cursor()

        cursor.execute(
            "INSERT INTO messages (username,sender,message) VALUES (?,?,?)",
            (
                session["user"],
                "user",
                mensagem
            )
        )

        conn.commit()

        resposta = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": """
Você é PedroGPT.
Criado por Pedro Henrique.
Responda sempre em português.
Seja amigável, inteligente e útil.
"""
                },
                {
                    "role": "user",
                    "content": mensagem
                }
            ]
        )

        texto = resposta.choices[0].message.content

        cursor.execute(
            "INSERT INTO messages (username,sender,message) VALUES (?,?,?)",
            (
                session["user"],
                "bot",
                texto
            )
        )

        conn.commit()
        conn.close()

        return jsonify({
            "reply": texto
        })

    except Exception as e:

        return jsonify({
            "reply": f"Erro: {str(e)}"
        })

# ==========================
# HISTÓRICO
# ==========================

@app.route("/history")
def history():

    if "user" not in session:
        return jsonify([])

    conn = sqlite3.connect("database.db")
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT sender,message
        FROM messages
        WHERE username=?
        """,
        (session["user"],)
    )

    dados = cursor.fetchall()

    conn.close()

    return jsonify(dados)

# ==========================
# START
# ==========================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="0.0.0.0",
        port=port
    )