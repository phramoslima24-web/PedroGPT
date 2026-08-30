// ============================================================
// ORION AI - SCRIPT.JS
// ============================================================

let enviando = false;
let arquivoSelecionado = null;
let vozes = [];

window.conversationId = null;


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
// ADICIONAR MENSAGEM
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

    conteudo.textContent = texto;

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

    html = html.replace(
        /```([\s\S]*?)```/g,
        function (_, codigo) {

            return `
                <pre class="codigo-pedrogpt">
                    <code>${codigo.trim()}</code>
                </pre>
            `;
        }
    );

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

    html = html.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
    );

    html = html.replace(
        /\*(.*?)\*/g,
        "<em>$1</em>"
    );

    html = html.replace(
        /\n/g,
        "<br>"
    );

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

    div.id =
        "typingMessage";

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

    chat.scrollTop =
        chat.scrollHeight;

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
// CSS DO HISTÓRICO
// ============================================================

function criarEstiloHistorico() {

    if (document.getElementById("estiloHistorico")) {
        return;
    }

    const style =
        document.createElement("style");

    style.id =
        "estiloHistorico";

    style.textContent = `

        .historico-titulo {
            font-size: 13px;
            font-weight: bold;
            color: rgba(255,255,255,.55);
            margin-top: 4px;
            padding: 0 4px;
        }

        .historico-conversas {
            display: flex;
            flex-direction: column;
            gap: 6px;
            overflow-y: auto;
            min-height: 0;
            flex: 1;
            padding-right: 3px;
        }

        .historico-conversa {
            display: flex;
            align-items: center;
            gap: 5px;
            width: 100%;
            border-radius: 10px;
            background: rgba(255,255,255,.035);
            border: 1px solid transparent;
            transition: .15s ease;
        }

        .historico-conversa:hover {
            background: rgba(255,255,255,.075);
            border-color: rgba(255,255,255,.08);
        }

        .historico-conversa.ativa {
            background: rgba(124,58,237,.18);
            border-color: rgba(124,58,237,.35);
        }

        .historico-abrir {
            flex: 1;
            min-width: 0;
            border: none;
            background: transparent;
            color: white;
            text-align: left;
            padding: 10px;
            cursor: pointer;
            overflow: hidden;
        }

        .historico-nome {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 13px;
        }

        .historico-acoes {
            display: flex;
            gap: 2px;
            padding-right: 5px;
        }

        .historico-acao {
            width: 27px;
            height: 27px;
            border: none;
            border-radius: 7px;
            background: transparent;
            color: rgba(255,255,255,.65);
            cursor: pointer;
            font-size: 13px;
        }

        .historico-acao:hover {
            background: rgba(255,255,255,.1);
            color: white;
        }

        .historico-acao.excluir:hover {
            color: #f87171;
        }

        .historico-vazio {
            color: rgba(255,255,255,.4);
            font-size: 12px;
            text-align: center;
            padding: 15px 5px;
        }

        .historico-conversas::-webkit-scrollbar {
            width: 5px;
        }

        .historico-conversas::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,.15);
            border-radius: 10px;
        }

    `;

    document.head.appendChild(style);
}


// ============================================================
// CRIAR ÁREA DO HISTÓRICO
// ============================================================

function criarAreaHistorico() {

    const sidebar =
        document.querySelector(".sidebar");

    if (!sidebar) {
        return null;
    }

    let area =
        elemento("historicoConversas");

    if (area) {
        return area;
    }

    criarEstiloHistorico();

    const titulo =
        document.createElement("div");

    titulo.className =
        "historico-titulo";

    titulo.textContent =
        "🗂️ Conversas";

    area =
        document.createElement("div");

    area.id =
        "historicoConversas";

    area.className =
        "historico-conversas";

    const botaoNova =
        elemento("btnNovaConversa");

    if (botaoNova) {

        botaoNova.insertAdjacentElement(
            "afterend",
            titulo
        );

        titulo.insertAdjacentElement(
            "afterend",
            area
        );

    } else {

        sidebar.appendChild(titulo);
        sidebar.appendChild(area);

    }

    return area;
}


// ============================================================
// CARREGAR LISTA DE CONVERSAS
// ============================================================

async function carregarConversas() {

    const area =
        criarAreaHistorico();

    if (!area) {
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

        if (resposta.status === 401) {

            window.location.href =
                "/login";

            return;
        }

        if (!resposta.ok) {

            throw new Error(
                "Erro ao carregar conversas."
            );
        }

        const conversas =
            await resposta.json();

        area.innerHTML = "";

        if (
            !Array.isArray(conversas) ||
            conversas.length === 0
        ) {

            area.innerHTML = `
                <div class="historico-vazio">
                    Nenhuma conversa ainda.
                </div>
            `;

            return;
        }

        conversas.forEach(
            function (conversa) {

                const item =
                    document.createElement("div");

                item.className =
                    "historico-conversa";

                if (
                    Number(window.conversationId) ===
                    Number(conversa.id)
                ) {

                    item.classList.add("ativa");
                }

                const abrir =
                    document.createElement("button");

                abrir.type =
                    "button";

                abrir.className =
                    "historico-abrir";

                const nome =
                    document.createElement("span");

                nome.className =
                    "historico-nome";

                nome.textContent =
                    conversa.title ||
                    "Nova conversa";

                abrir.appendChild(nome);

                abrir.addEventListener(
                    "click",
                    function () {

                        abrirConversa(
                            conversa.id
                        );
                    }
                );

                const acoes =
                    document.createElement("div");

                acoes.className =
                    "historico-acoes";

                const renomear =
                    document.createElement("button");

                renomear.type =
                    "button";

                renomear.className =
                    "historico-acao";

                renomear.title =
                    "Renomear";

                renomear.textContent =
                    "✏️";

                renomear.addEventListener(
                    "click",
                    function (event) {

                        event.stopPropagation();

                        renomearConversa(
                            conversa.id,
                            conversa.title
                        );
                    }
                );

                const excluir =
                    document.createElement("button");

                excluir.type =
                    "button";

                excluir.className =
                    "historico-acao excluir";

                excluir.title =
                    "Excluir";

                excluir.textContent =
                    "🗑️";

                excluir.addEventListener(
                    "click",
                    function (event) {

                        event.stopPropagation();

                        excluirConversa(
                            conversa.id
                        );
                    }
                );

                acoes.appendChild(
                    renomear
                );

                acoes.appendChild(
                    excluir
                );

                item.appendChild(
                    abrir
                );

                item.appendChild(
                    acoes
                );

                area.appendChild(
                    item
                );
            }
        );

    } catch (erro) {

        console.error(
            "ERRO AO CARREGAR CONVERSAS:",
            erro
        );

        area.innerHTML = `
            <div class="historico-vazio">
                Não foi possível carregar o histórico.
            </div>
        `;
    }
}


// ============================================================
// ABRIR CONVERSA
// ============================================================

async function abrirConversa(
    conversationId
) {

    if (enviando) {
        return;
    }

    try {

        const resposta =
            await fetch(
                `/conversation/${conversationId}`,
                {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (resposta.status === 401) {

            window.location.href =
                "/login";

            return;
        }

        const dados =
            await resposta.json();

        if (
            !resposta.ok ||
            !dados.success
        ) {

            throw new Error(
                dados.message ||
                "Não foi possível abrir a conversa."
            );
        }

        window.conversationId =
            dados.conversation_id;

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
                "Nova conversa";
        }

        if (
            Array.isArray(
                dados.messages
            )
        ) {

            dados.messages.forEach(
                function (item) {

                    if (
                        item.sender === "user"
                    ) {

                        adicionarMensagem(
                            item.message,
                            "user"
                        );

                    } else {

                        adicionarResposta(
                            item.message,
                            false
                        );
                    }
                }
            );
        }

        atualizarWelcome();

        await carregarConversas();

        if (mensagemInput) {
            mensagemInput.focus();
        }

    } catch (erro) {

        console.error(
            "ERRO AO ABRIR CONVERSA:",
            erro
        );

        alert(
            "❌ Não foi possível abrir a conversa.\n\n" +
            erro.message
        );
    }
}


// ============================================================
// NOVA CONVERSA
// ============================================================

async function novaConversa() {

    if (enviando) {
        return;
    }

    const botao =
        document.querySelector(
            ".nova-conversa"
        );

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
            await fetch(
                "/new_chat",
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
                        JSON.stringify({})
                }
            );

        if (resposta.status === 401) {

            window.location.href =
                "/login";

            return;
        }

        const textoResposta =
            await resposta.text();

        let dados;

        try {

            dados =
                JSON.parse(
                    textoResposta
                );

        } catch (erro) {

            console.error(
                "Resposta /new_chat:",
                textoResposta
            );

            throw new Error(
                "O servidor retornou uma resposta inválida."
            );
        }

        if (
            !resposta.ok ||
            !dados.success
        ) {

            throw new Error(
                dados.message ||
                "Não foi possível criar uma nova conversa."
            );
        }

        window.conversationId =
            dados.conversation_id;

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
                "Nova conversa";
        }

        atualizarWelcome();

        await carregarConversas();

        if (mensagemInput) {
            mensagemInput.focus();
        }

        console.log(
            "Nova conversa criada:",
            dados.conversation_id
        );

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
// RENOMEAR CONVERSA
// ============================================================

async function renomearConversa(
    conversationId,
    tituloAtual
) {

    const novoTitulo =
        prompt(
            "Digite o novo nome da conversa:",
            tituloAtual ||
            "Nova conversa"
        );

    if (novoTitulo === null) {
        return;
    }

    const titulo =
        novoTitulo.trim();

    if (!titulo) {

        alert(
            "❌ O nome da conversa não pode ficar vazio."
        );

        return;
    }

    try {

        const resposta =
            await fetch(
                `/conversation/${conversationId}/rename`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type":
                            "application/json",
                        "Accept":
                            "application/json"
                    },
                    body:
                        JSON.stringify({
                            title: titulo
                        })
                }
            );

        const dados =
            await resposta.json();

        if (
            !resposta.ok ||
            !dados.success
        ) {

            throw new Error(
                dados.message ||
                "Não foi possível renomear."
            );
        }

        if (
            Number(window.conversationId) ===
            Number(conversationId)
        ) {

            const tituloElemento =
                elemento("tituloConversa");

            if (tituloElemento) {

                tituloElemento.textContent =
                    dados.title;
            }
        }

        await carregarConversas();

    } catch (erro) {

        console.error(
            "ERRO AO RENOMEAR:",
            erro
        );

        alert(
            "❌ Não foi possível renomear a conversa.\n\n" +
            erro.message
        );
    }
}


// ============================================================
// EXCLUIR CONVERSA
// ============================================================

async function excluirConversa(
    conversationId
) {

    const confirmar =
        confirm(
            "Tem certeza que deseja excluir esta conversa?"
        );

    if (!confirmar) {
        return;
    }

    try {

        const resposta =
            await fetch(
                `/conversation/${conversationId}`,
                {
                    method: "DELETE",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        const dados =
            await resposta.json();

        if (
            !resposta.ok ||
            !dados.success
        ) {

            throw new Error(
                dados.message ||
                "Não foi possível excluir a conversa."
            );
        }

        if (
            Number(window.conversationId) ===
            Number(conversationId)
        ) {

            window.conversationId =
                dados.conversation_id;

            await abrirConversa(
                dados.conversation_id
            );

        } else {

            await carregarConversas();
        }

    } catch (erro) {

        console.error(
            "ERRO AO EXCLUIR:",
            erro
        );

        alert(
            "❌ Não foi possível excluir a conversa.\n\n" +
            erro.message
        );
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

        if (arquivoSelecionado) {

            const arquivo =
                arquivoSelecionado;

            if (
                !arquivo.type ||
                !arquivo.type.startsWith(
                    "image/"
                )
            ) {

                if (typing) {
                    typing.remove();
                }

                adicionarResposta(
                    "❌ No momento, o Orion AI aceita apenas imagens."
                );

                return;
            }

            const base64 =
                await converterArquivoBase64(
                    arquivo
                );

            dadosEnvio.image =
                base64.split(",")[1];

            dadosEnvio.image_type =
                arquivo.type;
        }

        const resposta =
            await fetch(
                "/chat",
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
                        JSON.stringify(
                            dadosEnvio
                        )
                }
            );

        if (resposta.status === 401) {

            window.location.href =
                "/login";

            return;
        }

        const textoResposta =
            await resposta.text();

        let dados;

        try {

            dados =
                JSON.parse(
                    textoResposta
                );

        } catch (erro) {

            console.error(
                "Resposta /chat:",
                textoResposta
            );

            throw new Error(
                "O servidor retornou uma resposta inválida."
            );
        }

        if (typing) {
            typing.remove();
        }

        if (
            !resposta.ok ||
            dados.success === false
        ) {

            adicionarResposta(
                dados.reply ||
                dados.message ||
                "❌ Não foi possível obter uma resposta."
            );

            return;
        }

        if (dados.conversation_id) {

            window.conversationId =
                dados.conversation_id;
        }

        adicionarResposta(
            dados.reply ||
            "Não recebi uma resposta da IA."
        );

        limparArquivo();

        await carregarConversas();

    } catch (erro) {

        console.error(
            "ERRO AO ENVIAR:",
            erro
        );

        if (typing) {
            typing.remove();
        }

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

function converterArquivoBase64(
    arquivo
) {

    return new Promise(
        function (resolve, reject) {

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
// BOTÃO NOVA CONVERSA
// ============================================================

document.addEventListener(
    "click",
    function (event) {

        const botao =
            event.target.closest(
                "#btnNovaConversa, .nova-conversa"
            );

        if (!botao) {
            return;
        }

        event.preventDefault();

        novaConversa();
    }
);


// ============================================================
// ATALHO
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

if (
    btnArquivo &&
    arquivoInput
) {

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

            if (
                !arquivo.type ||
                !arquivo.type.startsWith(
                    "image/"
                )
            ) {

                alert(
                    "❌ Selecione uma imagem."
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

    arquivoSelecionado =
        null;

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
            voz =>
                voz.lang &&
                voz.lang
                    .toLowerCase()
                    .startsWith("pt")
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
// FALAR
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
        String(texto)
            .replace(
                /```[\s\S]*?```/g,
                ""
            )
            .replace(
                /[#*_>`]/g,
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

    fala.lang =
        "pt-BR";

    fala.rate =
        1;

    fala.pitch =
        1;

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
// CARREGAR HISTÓRICO DA CONVERSA ATUAL
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
            resposta.status === 401
        ) {

            window.location.href =
                "/login";

            return;
        }

        if (!resposta.ok) {

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

                    if (
                        item.sender ===
                        "user"
                    ) {

                        adicionarMensagem(
                            item.message,
                            "user"
                        );

                    } else {

                        adicionarResposta(
                            item.message,
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
            "ERRO HISTÓRICO:",
            erro
        );

        atualizarWelcome();
    }
}


// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        criarAreaHistorico();

        atualizarWelcome();

        await carregarHistorico();

        await carregarConversas();

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

window.abrirConversa =
    abrirConversa;

window.carregarConversas =
    carregarConversas;

window.renomearConversa =
    renomearConversa;

window.excluirConversa =
    excluirConversa;
