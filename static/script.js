async function enviar() {

    const input = document.getElementById("mensagem");
    const texto = input.value.trim();

    if (!texto) return;

    const chat = document.getElementById("chat");

    chat.innerHTML += `
        <div class="user">👤 ${texto}</div>
    `;

    input.value = "";

    try {

        const resposta = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                mensagem: texto
            })
        });

        const dados = await resposta.json();

        chat.innerHTML += `
            <div class="bot">🤖 ${dados.resposta}</div>
        `;

    } catch (erro) {

        chat.innerHTML += `
            <div class="bot">❌ Erro ao conectar com o servidor</div>
        `;

        console.error(erro);
    }

    chat.scrollTop = chat.scrollHeight;
}

document
.getElementById("mensagem")
.addEventListener("keypress", function(e){
    if(e.key === "Enter"){
        enviar();
    }
});