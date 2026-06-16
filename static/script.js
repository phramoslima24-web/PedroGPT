async function carregarHistorico() {

    try {

        const resposta = await fetch("/history");

        if (!resposta.ok) return;

        const historico = await resposta.json();

        const chat = document.getElementById("chat");
        chat.innerHTML = "";

        historico.forEach(item => {

            const sender = item[0];
            const message = item[1];

            const div = document.createElement("div");

            if (sender === "user") {
                div.className = "msg-user";
            } else {
                div.className = "msg-bot";
            }

            div.textContent = message;

            chat.appendChild(div);
        });

        chat.scrollTop = chat.scrollHeight;

    } catch (erro) {
        console.error("Erro no histórico:", erro);
    }
}

async function enviar() {

    const campo = document.getElementById("mensagem");
    const chat = document.getElementById("chat");

    const texto = campo.value.trim();

    if (!texto) return;

    const userDiv = document.createElement("div");
    userDiv.className = "msg-user";
    userDiv.textContent = texto;

    chat.appendChild(userDiv);
    chat.scrollTop = chat.scrollHeight;

    campo.value = "";

    try {

        const resposta = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: texto
            })
        });

        if (!resposta.ok) {
            throw new Error("HTTP " + resposta.status);
        }

        const data = await resposta.json();

        const botDiv = document.createElement("div");
        botDiv.className = "msg-bot";
        botDiv.textContent = data.reply;

        chat.appendChild(botDiv);
        chat.scrollTop = chat.scrollHeight;

        // 🔊 VOZ
        const opcaoVoz = document.getElementById("voz");

        if (opcaoVoz && opcaoVoz.checked) {

            speechSynthesis.cancel();

            const voz = new SpeechSynthesisUtterance(data.reply);
            voz.lang = "pt-BR";

            speechSynthesis.speak(voz);
        }

    } catch (erro) {

        console.error("Erro no chat:", erro);

        const erroDiv = document.createElement("div");
        erroDiv.className = "msg-bot";
        erroDiv.textContent = "Erro ao conectar com o servidor (" + erro.message + ")";

        chat.appendChild(erroDiv);
    }
}

// INIT
document.addEventListener("DOMContentLoaded", () => {

    carregarHistorico();

    const campo = document.getElementById("mensagem");

    if (campo) {
        campo.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                enviar();
            }
        });
    }

    const opcaoVoz = document.getElementById("voz");

    if (opcaoVoz) {
        opcaoVoz.addEventListener("change", () => {
            if (!opcaoVoz.checked) {
                speechSynthesis.cancel();
            }
        });
    }
});