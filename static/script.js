// =====================
// BASE URL
// =====================
const API = "https://pedrogpt.onrender.com";


// =====================
// ARQUIVOS SELECIONADOS
// =====================
let arquivosSelecionados = [];


// =====================
// FORMATAR RESPOSTA
// =====================
function formatarResposta(texto) {

    if (!texto) return "";

    let html = String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const blocosCodigo = [];

    html = html.replace(
        /```([\s\S]*?)```/g,
        function (_, codigo) {

            const id = blocosCodigo.length;

            blocosCodigo.push(
                `<pre class="codigo-pedrogpt"><code>${codigo.trim()}</code></pre>`
            );

            return `___CODIGO_${id}___`;
        }
    );

    html = html.replace(
        /\*\*(.+?)\*\*/g,
        "<strong>$1</strong>"
    );

    html = html.replace(
        /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
        "<em>$1</em>"
    );

    html = html.replace(
        /^### (.+)$/gm,
        "<h4>$1</h4>"
    );

    html = html.replace(
        /^## (.+)$/gm,
        "<h3>$1</h3>"
    );

    html = html.replace(
        /^# (.+)$/gm,
        "<h2>$1</h2>"
    );

    const linhas = html.split("\n");

    let resultado = "";
    let listaAberta = false;
    let listaNumeradaAberta = false;

    linhas.forEach(linha => {

        const linhaTrim = linha.trim();

        if (/^[-•]\s+/.test(linhaTrim)) {

            if (listaNumeradaAberta) {
                resultado += "</ol>";
                listaNumeradaAberta = false;
            }

            if (!listaAberta) {
                resultado += "<ul>";
                listaAberta = true;
            }

            const item =
                linhaTrim.replace(/^[-•]\s+/, "");

            resultado += `<li>${item}</li>`;

            return;
        }

        if (/^\d+[.)]\s+/.test(linhaTrim)) {

            if (listaAberta) {
                resultado += "</ul>";
                listaAberta = false;
            }

            if (!listaNumeradaAberta) {
                resultado += "<ol>";
                listaNumeradaAberta = true;
            }

            const item =
                linhaTrim.replace(/^\d+[.)]\s+/, "");

            resultado += `<li>${item}</li>`;

            return;
        }

        if (listaAberta) {
            resultado += "</ul>";
            listaAberta = false;
        }

        if (listaNumeradaAberta) {
            resultado += "</ol>";
            listaNumeradaAberta = false;
        }

        if (!linhaTrim) {

            resultado +=
                "<div class='quebra-linha'></div>";

            return;
        }

        resultado +=
            `<div class="linha-resposta">${linha}</div>`;
    });

    if (listaAberta) {
        resultado += "</ul>";
    }

    if (listaNumeradaAberta) {
        resultado += "</ol>";
    }

    blocosCodigo.forEach((codigo, index) => {

        resultado = resultado.replace(
            `___CODIGO_${index}___`,
            codigo
        );

    });

    return resultado;
}


// =====================
// HISTÓRICO
// =====================
async function carregarHistorico() {

    try {

        const resposta =
            await fetch(`${API}/history`);

        if (!resposta.ok) {

            console.warn(
                "Erro ao carregar histórico:",
                resposta.status
            );

            return;
        }

        const historico =
            await resposta.json();

        const chat =
            document.getElementById("chat");

        if (!chat) return;

        chat.innerHTML = "";

        historico.forEach(item => {

            let sender;
            let message;

            if (Array.isArray(item)) {

                sender = item[0];
                message = item[1];

            } else {

                sender =
                    item?.sender ?? "bot";

                message =
                    item?.message ?? "";

            }

            addMensagem(
                message,
                sender === "user"
                    ? "user"
                    : "bot"
            );

        });

        if (historico.length > 0) {

            esconderWelcome();

        }

        scrollBottom();

    } catch (erro) {

        console.error(
            "Erro no histórico:",
            erro
        );

    }
}


// =====================
// ESCONDER WELCOME
// =====================
function esconderWelcome() {

    const welcome =
        document.getElementById("welcome");

    if (welcome) {

        welcome.classList.add("hidden");

    }
}


// =====================
// MOSTRAR ARQUIVOS
// =====================
function mostrarArquivos() {

    const container =
        document.getElementById("anexos");

    if (!container) return;

    container.innerHTML = "";

    arquivosSelecionados.forEach(
        function(file, index) {

            const div =
                document.createElement("div");

            div.className = "anexo";

            let icone = "📄";

            if (
                file.type &&
                file.type.startsWith("image/")
            ) {

                icone = "🖼️";

            }

            div.innerHTML = `

                <span>${icone}</span>

                <span class="anexo-nome">
                    ${escapeHtml(file.name)}
                </span>

                <button
                    class="remover-anexo"
                    onclick="removerArquivo(${index})"
                    title="Remover"
                >
                    ×
                </button>

            `;

            container.appendChild(div);

        }
    );
}


// =====================
// REMOVER ARQUIVO
// =====================
function removerArquivo(index) {

    arquivosSelecionados.splice(
        index,
        1
    );

    mostrarArquivos();

    const input =
        document.getElementById("arquivo");

    if (input) {

        input.value = "";

    }
}


// =====================
// ESCOLHER ARQUIVOS
// =====================
document.addEventListener(
    "DOMContentLoaded",
    function() {

        const input =
            document.getElementById("arquivo");

        if (!input) return;

        input.addEventListener(
            "change",
            function() {

                const novosArquivos =
                    Array.from(this.files);

                arquivosSelecionados =
                    arquivosSelecionados.concat(
                        novosArquivos
                    );

                mostrarArquivos();

                esconderWelcome();

            }
        );

    }
);


// =====================
// ENVIAR
// =====================
async function enviar() {

    const campo =
        document.getElementById("mensagem");

    if (!campo) return;

    const texto =
        campo.value.trim();


    // =====================
    // VERIFICA SE TEM ALGO
    // =====================

    if (
        !texto &&
        arquivosSelecionados.length === 0
    ) {

        return;

    }


    esconderWelcome();


    // =====================
    // MOSTRA MENSAGEM
    // =====================

    addMensagemComArquivos(
        texto,
        arquivosSelecionados
    );


    campo.value = "";


    // =====================
    // TYPING
    // =====================

    const typing =
        addMensagem(
            "",
            "bot typing"
        );


    try {

        /*
         * Nesta fase enviamos:
         *
         * message
         * files
         *
         * O backend será preparado
         * para receber esses dados.
         */

        const formData =
            new FormData();

        formData.append(
            "message",
            texto
        );


        arquivosSelecionados.forEach(
            function(file) {

                formData.append(
                    "files",
                    file
                );

            }
        );


        const resposta =
            await fetch(
                `${API}/chat`,
                {
                    method: "POST",
                    body: formData
                }
            );


        if (!resposta.ok) {

            console.warn(
                "Erro HTTP:",
                resposta.status
            );

            if (typing) {

                typing.remove();

            }

            addMensagem(
                "Erro ao conectar com o servidor.",
                "bot"
            );

            return;
        }


        const data =
            await resposta.json();


        if (typing) {

            typing.remove();

        }


        addMensagem(
            data.reply ||
            "Não recebi uma resposta da IA.",
            "bot"
        );


        // =====================
        // VOZ
        // =====================

        const opcaoVoz =
            document.getElementById("voz");

        if (
            opcaoVoz &&
            opcaoVoz.checked &&
            data.reply
        ) {

            speechSynthesis.cancel();

            const voz =
                new SpeechSynthesisUtterance(
                    data.reply
                );

            voz.lang = "pt-BR";

            speechSynthesis.speak(voz);

        }


    } catch (erro) {

        console.error(
            "Erro no chat:",
            erro
        );

        if (typing) {

            typing.remove();

        }

        addMensagem(
            "Erro ao conectar com o servidor.",
            "bot"
        );

    }


    // =====================
    // LIMPA ANEXOS
    // =====================

    arquivosSelecionados = [];

    mostrarArquivos();

    const input =
        document.getElementById("arquivo");

    if (input) {

        input.value = "";

    }

}


// =====================
// MENSAGEM COM ARQUIVOS
// =====================
function addMensagemComArquivos(
    texto,
    arquivos
) {

    const div =
        document.createElement("div");

    div.classList.add(
        "msg-user"
    );


    let conteudo = "";


    // =====================
    // TEXTO
    // =====================

    if (texto) {

        conteudo += `
            <div class="conteudo-mensagem">
                ${escapeHtml(texto)
                    .replace(/\n/g, "<br>")}
            </div>
        `;

    }


    // =====================
    // ARQUIVOS
    // =====================

    arquivos.forEach(
        function(file) {

            if (
                file.type &&
                file.type.startsWith("image/")
            ) {

                const url =
                    URL.createObjectURL(file);

                conteudo += `

                    <img
                        src="${url}"
                        class="imagem-anexada"
                        alt="${escapeHtml(file.name)}"
                    >

                `;

            } else {

                conteudo += `

                    <div class="anexo">

                        📄

                        <span class="anexo-nome">
                            ${escapeHtml(file.name)}
                        </span>

                    </div>

                `;

            }

        }
    );


    const now =
        new Date();

    const hora =
        now.getHours()
            .toString()
            .padStart(2, "0")
        + ":" +
        now.getMinutes()
            .toString()
            .padStart(2, "0");


    div.innerHTML = `

        ${conteudo}

        <div style="
            font-size:10px;
            opacity:0.5;
            margin-top:5px;
            text-align:right;
        ">
            ${hora}
        </div>

    `;


    const chat =
        document.getElementById("chat");

    if (chat) {

        chat.appendChild(div);

        scrollBottom();

    }

    return div;
}


// =====================
// MENSAGEM NORMAL
// =====================
function addMensagem(
    texto,
    tipo
) {

    const div =
        document.createElement("div");

    div.classList.add(
        tipo === "user"
            ? "msg-user"
            : "msg-bot"
    );


    // =====================
    // TYPING
    // =====================

    if (tipo.includes("typing")) {

        div.innerHTML = `

            <div>

                🤖 PedroGPT está digitando...

                <div class="typing-dots">

                    <span></span>
                    <span></span>
                    <span></span>

                </div>

            </div>

        `;


        const chat =
            document.getElementById("chat");

        if (chat) {

            chat.appendChild(div);

            requestAnimationFrame(() => {

                chat.scrollTop =
                    chat.scrollHeight;

            });

        }

        return div;
    }


    // =====================
    // HORA
    // =====================

    const now =
        new Date();

    const hora =
        now.getHours()
            .toString()
            .padStart(2, "0")
        + ":" +
        now.getMinutes()
            .toString()
            .padStart(2, "0");


    let conteudo;


    if (tipo === "user") {

        conteudo =
            escapeHtml(texto)
                .replace(
                    /\n/g,
                    "<br>"
                );

    } else {

        conteudo =
            formatarResposta(texto);

    }


    div.innerHTML = `

        <div class="conteudo-mensagem">

            ${conteudo}

        </div>

        <div style="
            font-size:10px;
            opacity:0.5;
            margin-top:5px;
            text-align:right;
        ">

            ${hora}

        </div>

    `;


    const chat =
        document.getElementById("chat");

    if (chat) {

        chat.appendChild(div);

        requestAnimationFrame(() => {

            chat.scrollTop =
                chat.scrollHeight;

        });

    }


    return div;
}


// =====================
// NOVA CONVERSA
// =====================
async function novaConversa() {

    if (
        !confirm(
            "Deseja criar uma nova conversa?"
        )
    ) {

        return;

    }


    try {

        const resposta =
            await fetch(
                `${API}/new_chat`,
                {
                    method: "POST"
                }
            );


        const data =
            await resposta.json();


        if (data.success) {

            const chat =
                document.getElementById("chat");

            if (chat) {

                chat.innerHTML = "";

            }


            arquivosSelecionados = [];

            mostrarArquivos();

            speechSynthesis.cancel();


            const welcome =
                document.getElementById("welcome");

            if (welcome) {

                welcome.classList.remove(
                    "hidden"
                );

            }

        } else {

            alert(
                "Erro ao criar nova conversa."
            );

        }


    } catch (erro) {

        console.error(erro);

        alert(
            "Erro ao conectar com o servidor."
        );

    }

}


// =====================
// SCROLL
// =====================
function scrollBottom() {

    const chat =
        document.getElementById("chat");

    if (chat) {

        chat.scrollTop =
            chat.scrollHeight;

    }

}


// =====================
// ESCAPE HTML
// =====================
function escapeHtml(texto) {

    return String(texto || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


// =====================
// INIT
// =====================
document.addEventListener(
    "DOMContentLoaded",
    () => {

        carregarHistorico();


        const campo =
            document.getElementById(
                "mensagem"
            );


        // =====================
        // ENTER
        // =====================

        if (campo) {

            campo.addEventListener(
                "keydown",
                function(event) {

                    if (
                        event.key === "Enter" &&
                        !event.shiftKey
                    ) {

                        event.preventDefault();

                        enviar();

                    }

                }
            );

        }


        // =====================
        // VOZ
        // =====================

        const opcaoVoz =
            document.getElementById(
                "voz"
            );


        if (opcaoVoz) {

            opcaoVoz.addEventListener(
                "change",
                () => {

                    if (
                        !opcaoVoz.checked
                    ) {

                        speechSynthesis.cancel();

                    }

                }
            );

        }

    }
);
