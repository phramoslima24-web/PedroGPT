async function enviarMensagem() {
    const input = document.getElementById("input").value;
    const chat = document.getElementById("chat");

    if (!input) return;

    chat.innerHTML += `<div><b>Você:</b> ${input}</div>`;

    try {
        const resposta = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message: input })
        });

        if (!resposta.ok) {
            throw new Error("Servidor respondeu erro");
        }

        const data = await resposta.json();

        chat.innerHTML += `<div><b>Bot:</b> ${data.reply}</div>`;

    } catch (error) {
        console.error(error);
        chat.innerHTML += `<div style="color:red"><b>Erro ao conectar com o servidor</b></div>`;
    }

    document.getElementById("input").value = "";
}