
// =====================
// BASE URL (NOVO - SÓ ISSO FOI ADICIONADO)
// =====================
const API = "https://pedrogpt.onrender.com";

// =====================
// HISTÓRICO
// =====================
async function carregarHistorico() {

    try {
        const resposta = await fetch(`${API}/history`);

        if (!resposta.ok) {
            console.warn("Erro ao carregar histórico:", resposta.status);
            return;
        }

        const historico = await resposta.json();

        const chat = document.getElementById("chat");
        chat.innerHTML = "";

        historico.forEach(item => {

            const sender = item?.[0] ?? "bot";
            const message = item?.[1] ?? "";

            addMensagem(message, sender === "user" ? "user" : "bot");
        });

        scrollBottom();

    } catch (erro) {
        console.error("Erro no histórico:", erro);
    }
}

// =====================
// ENVIAR MENSAGEM
// =====================
async function enviar() {

    const campo = document.getElementById("mensagem");
    const texto = campo.value.trim();

    if (!texto) return;

    addMensagem(texto, "user");
    campo.value = "";

    const typing = addMensagem("digitando...", "bot typing");

    try {

        const resposta = await fetch(`${API}/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message: texto })
        });

        if (!resposta.ok) {
            console.warn("Erro HTTP:", resposta.status);
            if (typing) typing.remove();
            addMensagem("Erro ao conectar com o servidor", "bot");
            return;
        }

        const data = await resposta.json();

        if (typing) typing.remove();

        addMensagem(data.reply, "bot");

        // VOZ
        const opcaoVoz = document.getElementById("voz");

        if (opcaoVoz && opcaoVoz.checked) {
            speechSynthesis.cancel();

            const voz = new SpeechSynthesisUtterance(data.reply);
            voz.lang = "pt-BR";

            speechSynthesis.speak(voz);
        }

    } catch (erro) {

        console.error("Erro no chat:", erro);

        if (typing) typing.remove();
        addMensagem("Erro ao conectar com o servidor", "bot");
    }
}

// =====================
// MENSAGEM (WHATSAPP STYLE)
// =====================
function addMensagem(texto, tipo) {

    const div = document.createElement("div");

    div.classList.add(tipo === "user" ? "msg-user" : "msg-bot");

    if (tipo.includes("typing")) {
        div.style.opacity = "0.6";
        div.style.fontStyle = "italic";
    }

    const now = new Date();
    const hora =
        now.getHours().toString().padStart(2, "0") + ":" +
        now.getMinutes().toString().padStart(2, "0");

    div.innerHTML = `
        <div>${texto}</div>
        <div style="font-size:10px;opacity:0.5;margin-top:5px;text-align:right;">
            ${hora}
        </div>
    `;

    const chat = document.getElementById("chat");
    chat.appendChild(div);

    requestAnimationFrame(() => {
        chat.scrollTop = chat.scrollHeight;
    });

    return div;
}

// =====================
// NOVA CONVERSA
// =====================
async function novaConversa() {

    if (!confirm("Deseja apagar todo o histórico desta conversa?")) return;

    try {

        const resposta = await fetch(`${API}/new_chat`, {
            method: "POST"
        });

        const data = await resposta.json();

        if (data.success) {
            document.getElementById("chat").innerHTML = "";
            speechSynthesis.cancel();
        } else {
            alert("Erro ao criar nova conversa.");
        }

    } catch (erro) {
        console.error(erro);
        alert("Erro ao conectar com o servidor.");
    }
}

// =====================
// SCROLL
// =====================
function scrollBottom() {
    const chat = document.getElementById("chat");
    chat.scrollTop = chat.scrollHeight;
}

// =====================
// INIT
// =====================
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