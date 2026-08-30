````javascript
// ============================================================
// ORION AI - SCRIPT.JS
// ============================================================

let enviando = false;
let arquivoSelecionado = null;
let vozes = [];

let conversaSelecionada = null;
let modoSelecao = false;


// ============================================================
// ELEMENTOS
// ============================================================

function elemento(id) {
    return document.getElementById(id);
}

const chat = elemento("chat");
const welcome = elemento("welcome");
const mensagemInput = elemento("mensagem");
const btnEnviar = elemento("btnEnviar");
const btnArquivo = elemento("btnArquivo");
const arquivoInput = elemento("arquivo");
const arquivoBox = elemento("arquivoSelecionado");
const nomeArquivo = elemento("nomeArquivo");
const removerArquivo = elemento("removerArquivo");


// ============================================================
// ESCAPAR HTML
// ============================================================

function escaparHTML(texto) {
    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ============================================================
// WELCOME
// ============================================================

function atualizarWelcome() {

    if (!chat || !welcome) {
        return;
    }

    if (chat.children.length === 0) {
        welcome.classList.remove("hidden");
    } else {
        welcome.classList.add("hidden");
    }
}


// ============================================================
// ADICIONAR MENSAGEM DO USUÁRIO
// ============================================================

function adicionarMensagem(texto, tipo = "user") {

    if (!chat) {
        return null;
    }

    const div = document.createElement("div");

    div.className =
        tipo === "user"
            ? "msg-user"
            : "msg-bot";

    const conteudo = document.createElement("div");

    conteudo.className = "conteudo-mensagem";

    conteudo.textContent = String(texto ?? "");

    div.appendChild(conteudo);

    chat.appendChild(div);

    atualizarWelcome();

    chat.scrollTop = chat.scrollHeight;

    return div;
}


// ============================================================
// MARKDOWN
// ============================================================

function formatarResposta(texto) {

    let html = escaparHTML(texto);

    // Código em bloco
    html = html.replace(
        /```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g,
        function (_, codigo) {

            return `
                <pre class="codigo-pedrogpt"><code>${codigo.trim()}</code></pre>
            `;
        }
    );

    // Títulos
    html = html.replace(
        /^### (.*)$/gm,
        "<h4>$1</h4>"
    );

    html = html.replace(
        /^## (.*)$/gm,
        "<h3>$1</h3>"
    );

    html = html.replace(
        /^# (.*)$/gm,
        "<h2>$1</h2>"
    );

    // Negrito
    html = html.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
    );

    // Itálico
    html = html.replace(
        /(^|[^*])\*([^*\n]+)\*(?!\*)/g,
        "$1<em>$2</em>"
    );

    // Quebras de linha
    html = html.replace(/\n/g, "<br>");

    return html;
}


// ============================================================
// ADICIONAR RESPOSTA DA IA
// ============================================================

function adicionarResposta(texto, falar = true) {

    if (!chat) {
        return null;
    }

    const div = document.createElement("div");

    div.className = "msg-bot";

    const conteudo = document.createElement("div");

    conteudo.className = "conteudo-mensagem";

    conteudo.innerHTML =
        formatarResposta(texto);

    div.appendChild(conteudo);

    chat.appendChild(div);

    atualizarWelcome();

    chat.scrollTop = chat.scrollHeight;

    if (falar) {
        falarResposta(texto);
    }

    return div;
}


// ============================================================
// TYPING
// ============================================================

function mostrarTyping() {

    if (!chat) {
        return null;
    }

    removerTyping();

    const div = document.createElement("div");

    div.className =
        "msg-bot typing-message";

    div.id = "typingMessage";

    div.innerHTML = `
        <div class="conteudo-mensagem">
            Orion AI está digitando
            <span class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </span>
        </div>
    `;

    chat.appendChild(div);

    atualizarWelcome();

    chat.scrollTop = chat.scrollHeight;

    return div;
}


function removerTyping() {

    const typing =
        elemento("typingMessage");

    if (typing) {
        typing.remove();
    }
}


// ============================================================
// NOVA CONVERSA
// ============================================================

async function novaConversa() {

    if (enviando) {
        return;
    }

    sairModoSelecao();

    const botao =
        document.querySelector(".nova-conversa");

    const textoOriginal =
        botao
            ? botao.innerHTML
            : "🆕 Nova conversa";

    try {

        enviando = true;

        if (botao) {

            botao.disabled = true;

            botao.innerHTML =
                "⏳ Criando...";
        }

        const resposta =
            await fetch("/new_chat", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Accept":
                        "application/json",
                    "Content-Type":
                        "application/json"
                },
                body:
                    JSON.stringify({})
            });

        if (resposta.redirected) {

            window.location.href =
                resposta.url;

            return;
        }

        const textoResposta =
            await resposta.text();

        let dados;

        try {

            dados =
                JSON.parse(textoResposta);

        } catch (erro) {

            console.error(
                "Resposta inválida do /new_chat:",
                textoResposta
            );

            throw new Error(
                "O servidor retornou uma resposta inválida."
            );
        }

        if (
            !resposta.ok ||
            dados.success === false
        ) {

            throw new Error(
                dados.message ||
                "Não foi possível criar uma nova conversa."
            );
        }

        if (dados.conversation_id) {

            window.conversationId =
                dados.conversation_id;
        }

        if (chat) {
            chat.innerHTML = "";
        }

        removerTyping();

        if (mensagemInput) {
            mensagemInput.value = "";
        }

        limparArquivo();

        const titulo =
            elemento("tituloConversa");

        if (titulo) {

            titulo.textContent =
                dados.title ||
                dados.titulo ||
                "Nova conversa";
        }

        atualizarWelcome();

        await carregarHistoricoConversas();

        if (mensagemInput) {
            mensagemInput.focus();
        }

    } catch (erro) {

        console.error(
            "ERRO NOVA CONVERSA:",
            erro
        );

        alert(
            "❌ Não foi possível criar uma nova conversa.\n\n" +
            erro.message
        );

    } finally {

        enviando = false;

        if (botao) {

            botao.disabled = false;

            botao.innerHTML =
                textoOriginal ||
                "🆕 Nova conversa";
        }
    }
}


// ============================================================
// ENVIAR MENSAGEM
// ============================================================

async function enviar() {

    if (enviando) {
        return;
    }

    if (!mensagemInput) {
        return;
    }

    const texto =
        mensagemInput.value.trim();

    const temArquivo =
        arquivoSelecionado !== null;

    if (!texto && !temArquivo) {

        mensagemInput.focus();

        return;
    }

    enviando = true;

    if (btnEnviar) {

        btnEnviar.disabled = true;

        btnEnviar.textContent =
            "Enviando...";
    }

    if (texto) {

        adicionarMensagem(
            texto,
            "user"
        );

    } else {

        adicionarMensagem(
            "📷 Imagem enviada",
            "user"
        );
    }

    mensagemInput.value = "";

    const typing =
        mostrarTyping();

    try {

        const dadosEnvio = {
            message: texto
        };

        // ====================================================
        // IMAGEM
        // ====================================================

        if (arquivoSelecionado) {

            const arquivo =
                arquivoSelecionado;

            if (
                arquivo.type &&
                arquivo.type.startsWith("image/")
            ) {

                const base64 =
                    await converterArquivoBase64(
                        arquivo
                    );

                if (!base64) {
                    throw new Error(
                        "Não foi possível processar a imagem."
                    );
                }

                const partes =
                    base64.split(",");

                dadosEnvio.image =
                    partes.length > 1
                        ? partes[1]
                        : partes[0];

                dadosEnvio.image_type =
                    arquivo.type;

            } else {

                removerTyping();

                adicionarResposta(
                    "❌ No momento, o Orion AI aceita apenas imagens JPG, PNG, WEBP ou GIF."
                );

                limparArquivo();

                return;
            }
        }

        // ====================================================
        // CHAT
        // ====================================================

        const resposta =
            await fetch("/chat", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Accept":
                        "application/json",
                    "Content-Type":
                        "application/json"
                },
                body:
                    JSON.stringify(
                        dadosEnvio
                    )
            });

        if (resposta.redirected) {

            window.location.href =
                resposta.url;

            return;
        }

        const textoResposta =
            await resposta.text();

        let dados;

        try {

            dados =
                JSON.parse(textoResposta);

        } catch (erro) {

            console.error(
                "Resposta do /chat:",
                textoResposta
            );

            throw new Error(
                "O servidor retornou uma resposta inválida."
            );
        }

        removerTyping();

        // ====================================================
        // ERRO DO SERVIDOR
        // ====================================================

        if (
            !resposta.ok ||
            dados.success === false
        ) {

            adicionarResposta(
                dados.reply ||
                dados.message ||
                dados.error ||
                "❌ Não foi possível obter uma resposta."
            );

            return;
        }

        // ====================================================
        // ID DA CONVERSA
        // ====================================================

        if (dados.conversation_id) {

            window.conversationId =
                dados.conversation_id;
        }

        // ====================================================
        // RESPOSTA
        // ====================================================

        const respostaIA =
            dados.reply ||
            dados.response ||
            dados.message ||
            dados.answer ||
            "Não recebi uma resposta da IA.";

        adicionarResposta(
            respostaIA
        );

        // ====================================================
        // TÍTULO
        // ====================================================

        if (dados.title || dados.titulo) {

            const titulo =
                elemento("tituloConversa");

            if (titulo) {

                titulo.textContent =
                    dados.title ||
                    dados.titulo;
            }
        }

        limparArquivo();

        // Atualiza lista lateral
        await carregarHistoricoConversas();

    } catch (erro) {

        console.error(
            "ERRO AO ENVIAR:",
            erro
        );

        removerTyping();

        adicionarResposta(
            "❌ Erro ao conectar com o servidor. Tente novamente."
        );

    } finally {

        enviando = false;

        if (btnEnviar) {

            btnEnviar.disabled = false;

            btnEnviar.textContent =
                "Enviar";
        }

        if (mensagemInput) {
            mensagemInput.focus();
        }
    }
}


// ============================================================
// CONVERTER ARQUIVO
// ============================================================

function converterArquivoBase64(arquivo) {

    return new Promise(
        function (resolve, reject) {

            if (!arquivo) {

                reject(
                    new Error(
                        "Arquivo inválido."
                    )
                );

                return;
            }

            const leitor =
                new FileReader();

            leitor.onload =
                function () {

                    resolve(
                        leitor.result
                    );
                };

            leitor.onerror =
                function () {

                    reject(
                        new Error(
                            "Não foi possível ler a imagem."
                        )
                    );
                };

            leitor.readAsDataURL(
                arquivo
            );
        }
    );
}


// ============================================================
// ENTER
// ============================================================

if (mensagemInput) {

    mensagemInput.addEventListener(
        "keydown",
        function (event) {

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


// ============================================================
// BOTÃO ENVIAR
// ============================================================

if (btnEnviar) {

    btnEnviar.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            enviar();
        }
    );
}


// ============================================================
// NOVA CONVERSA
// ============================================================

document.addEventListener(
    "click",
    function (event) {

        const botao =
            event.target.closest(
                ".nova-conversa"
            );

        if (!botao) {
            return;
        }

        event.preventDefault();

        novaConversa();
    }
);


// ============================================================
// ATALHOS
// ============================================================

function atalho(texto) {

    if (!mensagemInput) {
        return;
    }

    mensagemInput.value =
        texto;

    mensagemInput.focus();

    enviar();
}


// ============================================================
// ARQUIVO
// ============================================================

if (btnArquivo && arquivoInput) {

    btnArquivo.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            arquivoInput.click();
        }
    );
}


if (arquivoInput) {

    arquivoInput.addEventListener(
        "change",
        function () {

            const arquivo =
                arquivoInput.files &&
                arquivoInput.files[0];

            if (!arquivo) {

                limparArquivo();

                return;
            }

            const tipo =
                arquivo.type
                    ? arquivo.type.toLowerCase()
                    : "";

            const extensoesPermitidas = [
                "image/jpeg",
                "image/jpg",
                "image/png",
                "image/webp",
                "image/gif"
            ];

            if (
                !extensoesPermitidas.includes(
                    tipo
                )
            ) {

                alert(
                    "❌ Selecione uma imagem JPG, PNG, WEBP ou GIF."
                );

                limparArquivo();

                return;
            }

            if (
                arquivo.size >
                20 * 1024 * 1024
            ) {

                alert(
                    "❌ A imagem não pode ter mais de 20 MB."
                );

                limparArquivo();

                return;
            }

            arquivoSelecionado =
                arquivo;

            if (nomeArquivo) {

                nomeArquivo.textContent =
                    arquivo.name;
            }

            if (arquivoBox) {

                arquivoBox.classList.add(
                    "ativo"
                );
            }
        }
    );
}


// ============================================================
// LIMPAR ARQUIVO
// ============================================================

function limparArquivo() {

    arquivoSelecionado = null;

    if (arquivoInput) {
        arquivoInput.value = "";
    }

    if (arquivoBox) {

        arquivoBox.classList.remove(
            "ativo"
        );
    }

    if (nomeArquivo) {

        nomeArquivo.textContent =
            "Nenhum arquivo selecionado";
    }
}


if (removerArquivo) {

    removerArquivo.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            limparArquivo();
        }
    );
}


// ============================================================
// VOZ
// ============================================================

function carregarVozes() {

    const seletor =
        elemento("seletorVoz");

    if (
        !("speechSynthesis" in window)
    ) {

        if (seletor) {

            seletor.innerHTML =
                `<option value="">Voz não disponível</option>`;
        }

        return;
    }

    vozes =
        window.speechSynthesis
            .getVoices();

    if (!seletor) {
        return;
    }

    seletor.innerHTML = "";

    const vozesPT =
        vozes.filter(
            function (voz) {

                return (
                    voz.lang &&
                    voz.lang
                        .toLowerCase()
                        .startsWith("pt")
                );
            }
        );

    const lista =
        vozesPT.length
            ? vozesPT
            : vozes;

    if (!lista.length) {

        seletor.innerHTML =
            `<option value="">Nenhuma voz disponível</option>`;

        return;
    }

    lista.forEach(
        function (voz) {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                String(
                    vozes.indexOf(voz)
                );

            option.textContent =
                `${voz.name} (${voz.lang})`;

            seletor.appendChild(
                option
            );
        }
    );
}


if (
    "speechSynthesis" in window
) {

    carregarVozes();

    window.speechSynthesis
        .onvoiceschanged =
        carregarVozes;
}


// ============================================================
// FALAR RESPOSTA
// ============================================================

function falarResposta(texto) {

    const checkbox =
        elemento("voz");

    if (
        !checkbox ||
        !checkbox.checked
    ) {
        return;
    }

    if (
        !("speechSynthesis" in window)
    ) {
        return;
    }

    const textoLimpo =
        String(texto ?? "")
            .replace(
                /```[\s\S]*?```/g,
                ""
            )
            .replace(
                /[#*_>`]/g,
                ""
            )
            .replace(
                /<[^>]*>/g,
                ""
            );

    if (!textoLimpo.trim()) {
        return;
    }

    window.speechSynthesis.cancel();

    const fala =
        new SpeechSynthesisUtterance(
            textoLimpo
        );

    const seletor =
        elemento("seletorVoz");

    if (
        seletor &&
        seletor.value !== ""
    ) {

        const indice =
            Number(
                seletor.value
            );

        if (vozes[indice]) {

            fala.voice =
                vozes[indice];
        }
    }

    fala.lang = "pt-BR";
    fala.rate = 1;
    fala.pitch = 1;

    window.speechSynthesis.speak(
        fala
    );
}


// ============================================================
// TESTAR VOZ
// ============================================================

const btnTestarVoz =
    elemento("btnTestarVoz");

if (btnTestarVoz) {

    btnTestarVoz.addEventListener(
        "click",
        function () {

            falarResposta(
                "Olá! Eu sou o Orion AI. Esta é a minha voz."
            );
        }
    );
}


// ============================================================
// HISTÓRICO - CARREGAR CONVERSA ATUAL
// ============================================================

async function carregarHistorico() {

    if (!chat) {
        return;
    }

    try {

        const resposta =
            await fetch(
                "/history",
                {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (
            resposta.status === 401 ||
            resposta.redirected
        ) {

            window.location.href =
                "/login";

            return;
        }

        if (!resposta.ok) {

            console.warn(
                "Erro ao carregar histórico:",
                resposta.status
            );

            atualizarWelcome();

            return;
        }

        const historico =
            await resposta.json();

        chat.innerHTML = "";

        if (
            Array.isArray(historico)
        ) {

            historico.forEach(
                function (item) {

                    if (!item) {
                        return;
                    }

                    const mensagem =
                        item.message ??
                        item.content ??
                        item.text ??
                        "";

                    if (
                        item.sender ===
                        "user"
                    ) {

                        adicionarMensagem(
                            mensagem,
                            "user"
                        );

                    } else {

                        adicionarResposta(
                            mensagem,
                            false
                        );
                    }
                }
            );
        }

        atualizarWelcome();

        chat.scrollTop =
            chat.scrollHeight;

    } catch (erro) {

        console.error(
            "ERRO AO CARREGAR HISTÓRICO:",
            erro
        );

        atualizarWelcome();
    }
}


// ============================================================
// HISTÓRICO - LISTA DE CONVERSAS
// ============================================================

async function carregarHistoricoConversas() {

    const container =
        elemento("historicoConversas");

    if (!container) {
        return;
    }

    try {

        const resposta =
            await fetch(
                "/conversations",
                {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (
            resposta.status === 401 ||
            resposta.redirected
        ) {

            window.location.href =
                "/login";

            return;
        }

        if (!resposta.ok) {

            console.warn(
                "Erro ao carregar conversas:",
                resposta.status
            );

            container.innerHTML = `
                <div class="historico-vazio">
                    Erro ao carregar conversas
                </div>
            `;

            return;
        }

        const dados =
            await resposta.json();

        const conversas =
            Array.isArray(dados)
                ? dados
                : (
                    Array.isArray(
                        dados.conversations
                    )
                        ? dados.conversations
                        : []
                );

        container.innerHTML = "";

        if (!conversas.length) {

            container.innerHTML = `
                <div class="historico-vazio">
                    Nenhuma conversa ainda
                </div>
            `;

            return;
        }

        conversas.forEach(
            function (conversa) {

                if (conversa) {
                    criarItemConversa(
                        conversa
                    );
                }
            }
        );

        atualizarSelecaoVisual();

    } catch (erro) {

        console.error(
            "ERRO AO CARREGAR CONVERSAS:",
            erro
        );

        container.innerHTML = `
            <div class="historico-vazio">
                Erro ao carregar conversas
            </div>
        `;
    }
}


// ============================================================
// CRIAR ITEM DA CONVERSA
// ============================================================

function criarItemConversa(conversa) {

    const container =
        elemento("historicoConversas");

    if (!container) {
        return;
    }

    const id =
        conversa.id ??
        conversa.conversation_id;

    if (
        id === null ||
        id === undefined ||
        id === ""
    ) {
        return;
    }

    const titulo =
        conversa.title ||
        conversa.titulo ||
        "Nova conversa";

    const item =
        document.createElement("div");

    item.className =
        "conversa-item";

    item.dataset.id =
        String(id);

    const abrir =
        document.createElement("button");

    abrir.type = "button";

    abrir.className =
        "conversa-abrir";

    const tituloSpan =
        document.createElement("span");

    tituloSpan.className =
        "conversa-titulo";

    tituloSpan.textContent =
        titulo;

    abrir.appendChild(
        tituloSpan
    );

    abrir.addEventListener(
        "click",
        function () {

            if (modoSelecao) {

                alternarSelecaoConversa(
                    id,
                    item
                );

                return;
            }

            abrirConversa(id);
        }
    );

    const acoes =
        document.createElement("div");

    acoes.className =
        "conversa-acoes";

    // ========================================================
    // SELECIONAR
    // ========================================================

    const btnSelecionar =
        document.createElement("button");

    btnSelecionar.type =
        "button";

    btnSelecionar.className =
        "btn-conversa btn-selecionar";

    btnSelecionar.title =
        "Selecionar";

    btnSelecionar.textContent =
        "☐";

    btnSelecionar.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

            alternarSelecaoConversa(
                id,
                item
            );
        }
    );

    // ========================================================
    // RENOMEAR
    // ========================================================

    const btnRenomear =
        document.createElement("button");

    btnRenomear.type =
        "button";

    btnRenomear.className =
        "btn-conversa btn-renomear";

    btnRenomear.title =
        "Renomear";

    btnRenomear.textContent =
        "✏️";

    btnRenomear.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

            renomearConversa(
                id,
                titulo
            );
        }
    );

    // ========================================================
    // EXCLUIR
    // ========================================================

    const btnExcluir =
        document.createElement("button");

    btnExcluir.type =
        "button";

    btnExcluir.className =
        "btn-conversa btn-excluir";

    btnExcluir.title =
        "Excluir";

    btnExcluir.textContent =
        "🗑️";

    btnExcluir.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

            excluirConversa(id);
        }
    );

    acoes.appendChild(
        btnSelecionar
    );

    acoes.appendChild(
        btnRenomear
    );

    acoes.appendChild(
        btnExcluir
    );

    item.appendChild(
        abrir
    );

    item.appendChild(
        acoes
    );

    container.appendChild(
        item
    );
}


// ============================================================
// ABRIR CONVERSA
// ============================================================

async function abrirConversa(id) {

    if (modoSelecao) {
        return;
    }

    if (
        id === null ||
        id === undefined ||
        id === ""
    ) {
        return;
    }

    try {

        const resposta =
            await fetch(
                `/conversation/${encodeURIComponent(id)}`,
                {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (
            resposta.status === 401 ||
            resposta.redirected
        ) {

            window.location.href =
                "/login";

            return;
        }

        const texto =
            await resposta.text();

        let dados;

        try {

            dados =
                JSON.parse(texto);

        } catch (erro) {

            console.error(
                "Resposta inválida:",
                texto
            );

            throw new Error(
                "O servidor retornou uma resposta inválida."
            );
        }

        if (!resposta.ok) {

            alert(
                dados.message ||
                "❌ Não foi possível abrir a conversa."
            );

            return;
        }

        window.conversationId =
            id;

        if (chat) {
            chat.innerHTML = "";
        }

        const mensagens =
            dados.messages ||
            dados.history ||
            [];

        if (Array.isArray(mensagens)) {

            mensagens.forEach(
                function (item) {

                    if (!item) {
                        return;
                    }

                    const mensagem =
                        item.message ??
                        item.content ??
                        item.text ??
                        "";

                    if (
                        item.sender ===
                        "user"
                    ) {

                        adicionarMensagem(
                            mensagem,
                            "user"
                        );

                    } else {

                        adicionarResposta(
                            mensagem,
                            false
                        );
                    }
                }
            );
        }

        const titulo =
            elemento("tituloConversa");

        if (titulo) {

            titulo.textContent =
                dados.title ||
                dados.titulo ||
                "Orion AI";
        }

        document
            .querySelectorAll(
                ".conversa-item"
            )
            .forEach(
                function (item) {

                    item.classList.toggle(
                        "ativa",
                        String(
                            item.dataset.id
                        ) === String(id)
                    );
                }
            );

        atualizarWelcome();

        if (chat) {
            chat.scrollTop =
                chat.scrollHeight;
        }

    } catch (erro) {

        console.error(
            "ERRO AO ABRIR CONVERSA:",
            erro
        );

        alert(
            "❌ Erro ao abrir a conversa."
        );
    }
}


// ============================================================
// RENOMEAR CONVERSA
// ============================================================

async function renomearConversa(
    id,
    tituloAtual
) {

    const novoTitulo =
        prompt(
            "Digite o novo nome da conversa:",
            tituloAtual
        );

    if (novoTitulo === null) {
        return;
    }

    const titulo =
        novoTitulo.trim();

    if (!titulo) {

        alert(
            "❌ O nome não pode ficar vazio."
        );

        return;
    }

    try {

        const resposta =
            await fetch(
                "/rename_conversation",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json",
                        "Content-Type":
                            "application/json"
                    },
                    body:
                        JSON.stringify({
                            conversation_id:
                                id,
                            title:
                                titulo
                        })
                }
            );

        const texto =
            await resposta.text();

        let dados;

        try {

            dados =
                JSON.parse(texto);

        } catch (erro) {

            throw new Error(
                "O servidor retornou uma resposta inválida."
            );
        }

        if (
            !resposta.ok ||
            dados.success === false
        ) {

            throw new Error(
                dados.message ||
                "Não foi possível renomear."
            );
        }

        const item =
            Array.from(
                document.querySelectorAll(
                    ".conversa-item"
                )
            ).find(
                function (elementoItem) {

                    return (
                        String(
                            elementoItem.dataset.id
                        ) === String(id)
                    );
                }
            );

        if (item) {

            const tituloElemento =
                item.querySelector(
                    ".conversa-titulo"
                );

            if (tituloElemento) {

                tituloElemento.textContent =
                    titulo;
            }
        }

        if (
            String(window.conversationId) ===
            String(id)
        ) {

            const tituloHeader =
                elemento(
                    "tituloConversa"
                );

            if (tituloHeader) {

                tituloHeader.textContent =
                    titulo;
            }
        }

    } catch (erro) {

        console.error(
            "ERRO AO RENOMEAR:",
            erro
        );

        alert(
            "❌ " +
            erro.message
        );
    }
}


// ============================================================
// EXCLUIR UMA CONVERSA
// ============================================================

async function excluirConversa(id) {

    if (
        id === null ||
        id === undefined ||
        id === ""
    ) {
        return;
    }

    const confirmar =
        confirm(
            "⚠️ Tem certeza que deseja excluir esta conversa?\n\n" +
            "As mensagens serão apagadas permanentemente."
        );

    if (!confirmar) {
        return;
    }

    try {

        const resposta =
            await fetch(
                "/delete_conversation",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json",
                        "Content-Type":
                            "application/json"
                    },
                    body:
                        JSON.stringify({
                            conversation_id:
                                id
                        })
                }
            );

        const texto =
            await resposta.text();

        let dados;

        try {

            dados =
                JSON.parse(texto);

        } catch (erro) {

            throw new Error(
                "O servidor retornou uma resposta inválida."
            );
        }

        if (
            !resposta.ok ||
            dados.success === false
        ) {

            throw new Error(
                dados.message ||
                "Não foi possível excluir a conversa."
            );
        }

        if (
            String(window.conversationId) ===
            String(id)
        ) {

            window.conversationId =
                null;

            if (chat) {
                chat.innerHTML = "";
            }

            const titulo =
                elemento(
                    "tituloConversa"
                );

            if (titulo) {

                titulo.textContent =
                    "Orion AI";
            }

            atualizarWelcome();
        }

        await carregarHistoricoConversas();

    } catch (erro) {

        console.error(
            "ERRO AO EXCLUIR:",
            erro
        );

        alert(
            "❌ " +
            erro.message
        );
    }
}


// ============================================================
// CRIAR BARRA DE SELEÇÃO
// ============================================================

function criarBarraSelecao() {

    if (
        elemento("barraSelecao")
    ) {
        return;
    }

    const sidebar =
        document.querySelector(
            ".sidebar"
        );

    const historicoTitulo =
        document.querySelector(
            ".historico-titulo"
        );

    if (!sidebar || !historicoTitulo) {
        return;
    }

    const barra =
        document.createElement("div");

    barra.id =
        "barraSelecao";

    barra.style.display =
        "none";

    barra.style.flexDirection =
        "column";

    barra.style.gap =
        "7px";

    barra.innerHTML = `

        <div style="
            display:flex;
            gap:6px;
        ">

            <button
                type="button"
                id="btnSelecionarTudo"
                style="
                    flex:1;
                    border:none;
                    padding:8px;
                    border-radius:8px;
                    background:rgba(255,255,255,.07);
                    color:white;
                    cursor:pointer;
                    font-size:12px;
                "
            >
                ☑️ Selecionar tudo
            </button>

            <button
                type="button"
                id="btnCancelarSelecao"
                style="
                    flex:1;
                    border:none;
                    padding:8px;
                    border-radius:8px;
                    background:rgba(255,255,255,.07);
                    color:white;
                    cursor:pointer;
                    font-size:12px;
                "
            >
                ❌ Cancelar
            </button>

        </div>

        <button
            type="button"
            id="btnExcluirSelecionadas"
            style="
                border:none;
                padding:9px;
                border-radius:8px;
                background:rgba(239,68,68,.18);
                border:1px solid rgba(239,68,68,.25);
                color:#fca5a5;
                cursor:pointer;
                font-weight:bold;
                font-size:12px;
            "
        >
            🗑️ Excluir selecionadas
            (<span id="contadorSelecionadas">0</span>)
        </button>
    `;

    sidebar.insertBefore(
        barra,
        historicoTitulo
    );

    const selecionarTudo =
        elemento("btnSelecionarTudo");

    const cancelar =
        elemento("btnCancelarSelecao");

    const excluir =
        elemento("btnExcluirSelecionadas");

    if (selecionarTudo) {

        selecionarTudo.addEventListener(
            "click",
            selecionarTodasConversas
        );
    }

    if (cancelar) {

        cancelar.addEventListener(
            "click",
            sairModoSelecao
        );
    }

    if (excluir) {

        excluir.addEventListener(
            "click",
            excluirSelecionadas
        );
    }
}


// ============================================================
// ENTRAR NO MODO SELEÇÃO
// ============================================================

function entrarModoSelecao() {

    modoSelecao = true;

    criarBarraSelecao();

    const barra =
        elemento("barraSelecao");

    if (barra) {

        barra.style.display =
            "flex";
    }

    atualizarSelecaoVisual();
}


// ============================================================
// SAIR DO MODO SELEÇÃO
// ============================================================

function sairModoSelecao() {

    modoSelecao = false;

    document
        .querySelectorAll(
            ".conversa-item.selecionada"
        )
        .forEach(
            function (item) {

                item.classList.remove(
                    "selecionada"
                );
            }
        );

    const barra =
        elemento("barraSelecao");

    if (barra) {

        barra.style.display =
            "none";
    }

    atualizarSelecaoVisual();
}


// ============================================================
// SELECIONAR / DESSELECIONAR
// ============================================================

function alternarSelecaoConversa(
    id,
    item
) {

    if (!item) {
        return;
    }

    if (!modoSelecao) {
        entrarModoSelecao();
    }

    item.classList.toggle(
        "selecionada"
    );

    atualizarSelecaoVisual();
}


// ============================================================
// ATUALIZAR VISUAL DA SELEÇÃO
// ============================================================

function atualizarSelecaoVisual() {

    const itens =
        document.querySelectorAll(
            ".conversa-item"
        );

    itens.forEach(
        function (item) {

            const selecionada =
                item.classList.contains(
                    "selecionada"
                );

            const botao =
                item.querySelector(
                    ".btn-selecionar"
                );

            if (botao) {

                botao.textContent =
                    selecionada
                        ? "☑️"
                        : "☐";
            }

            if (modoSelecao) {

                item.style.background =
                    selecionada
                        ? "rgba(124,58,237,.28)"
                        : "";

            } else {

                item.style.background =
                    "";
            }
        }
    );

    const selecionadas =
        document.querySelectorAll(
            ".conversa-item.selecionada"
        );

    const contador =
        elemento(
            "contadorSelecionadas"
        );

    if (contador) {

        contador.textContent =
            selecionadas.length;
    }
}


// ============================================================
// SELECIONAR TODAS
// ============================================================

function selecionarTodasConversas() {

    entrarModoSelecao();

    const itens =
        document.querySelectorAll(
            ".conversa-item"
        );

    itens.forEach(
        function (item) {

            item.classList.add(
                "selecionada"
            );
        }
    );

    atualizarSelecaoVisual();
}


// ============================================================
// PEGAR IDS SELECIONADOS
// ============================================================

function obterIdsSelecionados() {

    return Array.from(
        document.querySelectorAll(
            ".conversa-item.selecionada"
        )
    )
        .map(
            function (item) {

                return item.dataset.id;
            }
        )
        .filter(Boolean);
}


// ============================================================
// EXCLUIR VÁRIAS CONVERSAS
// ============================================================

async function excluirSelecionadas() {

    const ids =
        obterIdsSelecionados();

    if (!ids.length) {

        alert(
            "⚠️ Selecione pelo menos uma conversa."
        );

        return;
    }

    const confirmar =
        confirm(
            `⚠️ Você selecionou ${ids.length} conversa(s).\n\n` +
            "Todas as mensagens dessas conversas serão apagadas permanentemente.\n\n" +
            "Deseja continuar?"
        );

    if (!confirmar) {
        return;
    }

    const botao =
        elemento(
            "btnExcluirSelecionadas"
        );

    if (botao) {

        botao.disabled = true;

        botao.textContent =
            "⏳ Excluindo...";
    }

    try {

        const resposta =
            await fetch(
                "/delete_conversations",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json",
                        "Content-Type":
                            "application/json"
                    },
                    body:
                        JSON.stringify({
                            conversation_ids:
                                ids
                        })
                }
            );

        const texto =
            await resposta.text();

        let dados;

        try {

            dados =
                JSON.parse(texto);

        } catch (erro) {

            throw new Error(
                "O servidor retornou uma resposta inválida."
            );
        }

        if (
            !resposta.ok ||
            dados.success === false
        ) {

            throw new Error(
                dados.message ||
                "Não foi possível excluir as conversas."
            );
        }

        if (
            window.conversationId &&
            ids.some(
                function (id) {

                    return (
                        String(id) ===
                        String(
                            window.conversationId
                        )
                    );
                }
            )
        ) {

            window.conversationId =
                null;

            if (chat) {
                chat.innerHTML = "";
            }

            const titulo =
                elemento(
                    "tituloConversa"
                );

            if (titulo) {

                titulo.textContent =
                    "Orion AI";
            }

            atualizarWelcome();
        }

        sairModoSelecao();

        await carregarHistoricoConversas();

    } catch (erro) {

        console.error(
            "ERRO AO EXCLUIR VÁRIAS:",
            erro
        );

        alert(
            "❌ " +
            erro.message
        );

    } finally {

        if (botao) {

            botao.disabled = false;

            botao.innerHTML =
                `🗑️ Excluir selecionadas (<span id="contadorSelecionadas">0</span>)`;
        }
    }
}


// ============================================================
// BOTÃO PARA ATIVAR SELEÇÃO
// ============================================================

document.addEventListener(
    "dblclick",
    function (event) {

        const item =
            event.target.closest(
                ".conversa-item"
            );

        if (!item) {
            return;
        }

        entrarModoSelecao();

        item.classList.add(
            "selecionada"
        );

        atualizarSelecaoVisual();
    }
);


// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        criarBarraSelecao();

        atualizarWelcome();

        carregarHistorico();

        carregarHistoricoConversas();

        if (mensagemInput) {
            mensagemInput.focus();
        }
    }
);


// ============================================================
// EXPOR FUNÇÕES
// ============================================================

window.enviar =
    enviar;

window.novaConversa =
    novaConversa;

window.atalho =
    atalho;

window.limparArquivo =
    limparArquivo;

window.carregarHistorico =
    carregarHistorico;

window.carregarHistoricoConversas =
    carregarHistoricoConversas;

window.abrirConversa =
    abrirConversa;

window.renomearConversa =
    renomearConversa;

window.excluirConversa =
    excluirConversa;

window.entrarModoSelecao =
    entrarModoSelecao;

window.sairModoSelecao =
    sairModoSelecao;

window.excluirSelecionadas =
    excluirSelecionadas;
````
