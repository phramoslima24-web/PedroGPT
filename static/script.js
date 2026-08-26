````javascript
// =====================
// BASE URL
// =====================

const API = "https://pedrogpt.onrender.com";


// =====================
// ELEMENTOS
// =====================

function elemento(id) {
    return document.getElementById(id);
}


// =====================
// ESCONDER WELCOME
// =====================

function esconderWelcome() {

    const welcome = elemento("welcome");

    if (welcome) {
        welcome.classList.add("hidden");
    }
}


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


    // =====================
    // CÓDIGO
    // =====================

    const blocosCodigo = [];

    html = html.replace(
        /```([\s\S]*?)```/g,
        function(_, codigo) {

            const id = blocosCodigo.length;

            blocosCodigo.push(
                `<pre class="codigo-pedrogpt"><code>${codigo.trim()}</code></pre>`
            );

            return `___CODIGO_${id}___`;
        }
    );


    // =====================
    // NEGRITO
    // =====================

    html = html.replace(
        /\*\*(.+?)\*\*/g,
        "<strong>$1</strong>"
    );


    // =====================
    // ITÁLICO
    // =====================

    html = html.replace(
        /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
        "<em>$1</em>"
    );


    // =====================
    // TÍTULOS
    // =====================

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


    // =====================
    // LISTAS
    // =====================

    const linhas = html.split("\n");

    let resultado = "";

    let listaAberta = false;
    let listaNumeradaAberta = false;


    linhas.forEach(linha => {

        const linhaTrim = linha.trim();


        // =====================
        // LISTA NORMAL
        // =====================

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
                linhaTrim.replace(
                    /^[-•]\s+/,
                    ""
                );


            resultado += `<li>${item}</li>`;

            return;

        }


        // =====================
        // LISTA NUMERADA
        // =====================

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
                linhaTrim.replace(
                    /^\d+[.)]\s+/,
                    ""
                );


            resultado += `<li>${item}</li>`;

            return;

        }


        // =====================
        // FECHAR LISTAS
        // =====================

        if (listaAberta) {

            resultado += "</ul>";

            listaAberta = false;

        }


        if (listaNumeradaAberta) {

            resultado += "</ol>";

            listaNumeradaAberta = false;

        }


        // =====================
        // LINHA VAZIA
        // =====================

        if (!linhaTrim) {

            resultado +=
                "<div class='quebra-linha'></div>";

            return;

        }


        // =====================
        // TEXTO
        // =====================

        resultado +=
            `<div class="linha-resposta">${linha}</div>`;

    });


    // =====================
    // FECHAR LISTAS
    // =====================

    if (listaAberta) {
        resultado += "</ul>";
    }

    if (listaNumeradaAberta) {
        resultado += "</ol>";
    }


    // =====================
    // RESTAURAR CÓDIGO
    // =====================

    blocosCodigo.forEach(
        (codigo, index) => {

            resultado =
                resultado.replace(
                    `___CODIGO_${index}___`,
                    codigo
                );

        }
    );


    return resultado;
}


// =====================
// HISTÓRICO
// =====================

async function carregarHistorico() {

    try {

        const resposta =
            await fetch(
                `${API}/history`,
                {
                    credentials: "include"
                }
            );


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
            elemento("chat");


        if (!chat) return;


        chat.innerHTML = "";


        if (!historico.length) {

            const welcome =
                elemento("welcome");

            if (welcome) {
                welcome.classList.remove("hidden");
            }

        } else {

            esconderWelcome();

        }


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


        scrollBottom();


    } catch (erro) {

        console.error(
            "Erro no histórico:",
            erro
        );

    }
}


// =====================
// ARQUIVO
// =====================

function obterArquivo() {

    const input =
        elemento("arquivo");

    if (!input) return null;

    if (!input.files.length) {
        return null;
    }

    return input.files[0];
}


// =====================
// PREVIEW DO ARQUIVO
// =====================

function arquivoSelecionado() {

    const input =
        elemento("arquivo");

    const display =
        elemento("arquivoSelecionado");


    if (!input || !display) return;


    if (!input.files.length) {

        display.style.display = "none";

        display.innerText = "";

        return;

    }


    const arquivo =
        input.files[0];


    display.innerText =
        "📎 " + arquivo.name;


    display.style.display =
        "block";

}


// =====================
// LIMPAR ARQUIVO
// =====================

function limparArquivo() {

    const input =
        elemento("arquivo");

    const display =
        elemento("arquivoSelecionado");


    if (input) {
        input.value = "";
    }


    if (display) {

        display.innerText = "";

        display.style.display = "none";

    }

}


// =====================
// ENVIAR
// =====================

async function enviar() {

    const campo =
        elemento("mensagem");


    if (!campo) return;


    const texto =
        campo.value.trim();


    const arquivo =
        obterArquivo();


    if (!texto && !arquivo) {
        return;
    }


    esconderWelcome();


    // =====================
    // MENSAGEM DO USUÁRIO
    // =====================

    if (texto) {

        addMensagem(
            texto,
            "user"
        );

    }


    // =====================
    // ARQUIVO
    // =====================

    if (arquivo) {

        adicionarMensagemArquivo(
            arquivo
        );

    }


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
         * IMPORTANTE:
         * Usamos FormData para permitir
         * texto + arquivo.
         */

        const formData =
            new FormData();


        formData.append(
            "message",
            texto
        );


        if (arquivo) {

            formData.append(
                "file",
                arquivo
            );

        }


        const resposta =
            await fetch(
                `${API}/chat`,
                {
                    method: "POST",

                    body: formData,

                    credentials: "include"
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


        // =====================
        // RESPOSTA
        // =====================

        addMensagem(
            data.reply ||
            "Não recebi uma resposta da IA.",
            "bot"
        );


        // =====================
        // VOZ
        // =====================

        const opcaoVoz =
            elemento("voz");


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


            speechSynthesis.speak(
                voz
            );

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

    } finally {

        limparArquivo();

    }
}


// =====================
// MENSAGEM COM ARQUIVO
// =====================

function adicionarMensagemArquivo(
    arquivo
) {

    const div =
        document.createElement("div");


    div.classList.add(
        "msg-user"
    );


    const conteudo =
        document.createElement(
            "div"
        );


    conteudo.classList.add(
        "conteudo-mensagem"
    );


    // =====================
    // IMAGEM
    // =====================

    if (
        arquivo.type &&
        arquivo.type.startsWith("image/")
    ) {

        const imagem =
            document.createElement("img");


        imagem.classList.add(
            "preview-imagem"
        );


        imagem.alt =
            arquivo.name;


        imagem.src =
            URL.createObjectURL(
                arquivo
            );


        conteudo.appendChild(
            imagem
        );

    }


    // =====================
    // ARQUIVO NORMAL
    // =====================

    const arquivoBox =
        document.createElement("div");


    arquivoBox.classList.add(
        "anexo-mensagem"
    );


    arquivoBox.innerHTML =
        "📎 " +
        escaparHTML(
            arquivo.name
        );


    conteudo.appendChild(
        arquivoBox
    );


    div.appendChild(
        conteudo
    );


    const chat =
        elemento("chat");


    if (chat) {

        chat.appendChild(
            div
        );


        scrollBottom();

    }

}


// =====================
// ESCAPAR HTML
// =====================

function escaparHTML(texto) {

    return String(texto || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// =====================
// MENSAGEM
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
            elemento("chat");


        if (chat) {

            chat.appendChild(
                div
            );

            scrollBottom();

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


    // =====================
    // CONTEÚDO
    // =====================

    let conteudo;


    if (tipo === "user") {

        conteudo =
            escaparHTML(
                texto
            )
            .replace(
                /\n/g,
                "<br>"
            );

    } else {

        conteudo =
            formatarResposta(
                texto
            );

    }


    // =====================
    // HTML
    // =====================

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
        elemento("chat");


    if (chat) {

        chat.appendChild(
            div
        );

        scrollBottom();

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
                    method: "POST",

                    credentials: "include"
                }
            );


        const data =
            await resposta.json();


        if (data.success) {

            const chat =
                elemento("chat");


            if (chat) {

                chat.innerHTML = "";

            }


            limparArquivo();


            speechSynthesis.cancel();


            const welcome =
                elemento("welcome");


            if (welcome) {

                welcome.classList.remove(
                    "hidden"
                );

            }


        } else {

            alert(
                data.message ||
                "Erro ao criar nova conversa."
            );

        }


    } catch (erro) {

        console.error(
            erro
        );


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
        elemento("chat");


    if (chat) {

        chat.scrollTop =
            chat.scrollHeight;

    }
}


// =====================
// ATALHOS
// =====================

function atalho(texto) {

    esconderWelcome();


    const campo =
        elemento("mensagem");


    if (!campo) return;


    campo.value =
        texto;


    campo.focus();

}


// =====================
// INIT
// =====================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        carregarHistorico();


        // =====================
        // ENTER
        // =====================

        const campo =
            elemento("mensagem");


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
            elemento("voz");


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


        // =====================
        // ARQUIVO
        // =====================

        const arquivo =
            elemento("arquivo");


        if (arquivo) {

            arquivo.addEventListener(
                "change",
                arquivoSelecionado
            );

        }

    }
);
````
