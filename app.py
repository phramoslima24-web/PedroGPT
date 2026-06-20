import os
import sqlite3
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from groq import Groq

app = Flask(__name__)
app.secret_key = "pedrogpt_secret_key"

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

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
# BANCO
# ==========================

def get_db():
    conn = sqlite3.connect("database.db", timeout=10, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    with get_db() as conn:
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
# REGISTER API
# ==========================

@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.get_json()

    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"success": False, "message": "Campos vazios"})

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                (username, password)
            )
            conn.commit()

        return jsonify({"success": True})

    except Exception:
        return jsonify({"success": False, "message": "Usuário já existe"})

# ==========================
# LOGIN API
# ==========================

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json()

    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM users WHERE username=? AND password=?",
            (username, password)
        )
        user = cursor.fetchone()

    if user:
        session["user"] = username
        return jsonify({"success": True})

    return jsonify({"success": False, "message": "Login inválido"})

# ==========================
# CHAT
# ==========================

@app.route("/chat", methods=["POST"])
def chat():

    if "user" not in session:
        return jsonify({"reply": "Faça login primeiro."})

    data = request.get_json()
    mensagem = (data.get("message") or "").strip()

    if not mensagem:
        return jsonify({"reply": "Digite uma mensagem."})

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO messages (username, sender, message) VALUES (?, ?, ?)",
            (session["user"], "user", mensagem)
        )
        conn.commit()

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT sender, message
                FROM messages
                WHERE username=?
                ORDER BY id DESC
                LIMIT 10
                """,
                (session["user"],)
            )
            historico = cursor.fetchall()

        mensagens_ia = [
            {
                "role": "system",
                "content": """
Você é o PedroGPT.

REGRAS DE RESPOSTA:
- Responda SEMPRE em português do Brasil
- Use tópicos organizados
- Use emojis para destacar pontos importantes
- NÃO use asteriscos (*)
- NÃO use markdown de listas
- Seja direto e claro
- Evite textos longos
- Explique passo a passo apenas quando necessário
"""
            }
        ]

        for sender, texto in reversed(historico):
            role = "assistant" if sender == "bot" else "user"
            mensagens_ia.append({
                "role": role,
                "content": texto
            })

        mensagens_ia.append({
            "role": "user",
            "content": mensagem + "\n\nResponda em tópicos com emojis e sem usar asteriscos."
        })

        resposta = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=mensagens_ia
        )

        texto = resposta.choices[0].message.content

    except Exception as e:
        texto = f"Erro IA: {str(e)}"

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO messages (username, sender, message) VALUES (?, ?, ?)",
            (session["user"], "bot", texto)
        )
        conn.commit()

    return jsonify({"reply": texto})

# ==========================
# HISTORY
# ==========================

@app.route("/history")
def history():
    if "user" not in session:
        return jsonify([])

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT sender, message FROM messages WHERE username=?",
            (session["user"],)
        )
        return jsonify(cursor.fetchall())

# ==========================
# NEW CHAT
# ==========================

@app.route("/new_chat", methods=["POST"])
def new_chat():
    if "user" not in session:
        return jsonify({"success": False})

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM messages WHERE username=?",
            (session["user"],)
        )
        conn.commit()

    return jsonify({"success": True})

# ==========================
# START
# ==========================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)