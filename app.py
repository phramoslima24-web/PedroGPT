import os
from flask import Flask, request, jsonify, render_template
from groq import Groq

app = Flask(__name__)

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                "reply": "Nenhum dado recebido."
            })

        mensagem = data.get("message", "")

        if not mensagem:
            return jsonify({
                "reply": "Digite uma mensagem."
            })

        resposta = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[
                {
                    "role": "system",
                    "content": "Você é um assistente útil e responde em português."
                },
                {
                    "role": "user",
                    "content": mensagem
                }
            ]
        )

        texto = resposta.choices[0].message.content

        return jsonify({
            "reply": texto
        })

    except Exception as e:
        print("ERRO:", str(e))

        return jsonify({
            "reply": f"Erro: {str(e)}"
        }), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)