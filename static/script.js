// ============================================================
// ORION AI - SCRIPT.JS
// ============================================================

let enviando = false;
let arquivoSelecionado = null;
let vozes = [];
let conversationId = window.conversationId || null;


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
const historicoConversas = elemento("historicoConversas");
const tituloConversa = elemento("tituloConversa");


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
                <pre class="codigo-pedrogpt"><code>${codigo.trim()}</code></pre>
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

    conteudo.innerHTML = formatarResposta(texto);

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

    div.className = "msg-bot typing-message";

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

    const typing = elemento("typingMessage");

    if (typing) {
        typing.remove();
    }
}


// ============================================================
// CARREGAR HISTÓRICO DE CONVERSAS
// ============================================================

async function carregarListaConversas() {

    if (!historicoConversas) {
        return;
    }

    try {

        historicoConversas.innerHTML = `
            <div class="historico-vazio">
                ⏳ Carregando conversas...
            </div>
        `;

        const resposta = await fetch(
            "/conversations",
            {
                method: "GET",
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json"
                }
            }
        );

        if (resposta.status === 401) {

            window.location.href = "/login";

            return;
        }

        if (!resposta.ok) {

            throw new Error(
                "Erro ao carregar conversas."
            );
        }

        const conversas = await resposta.json();

        historicoConversas.innerHTML = "";

        if (
            !Array.isArray(conversas) ||
            conversas.length === 0
        ) {

            historicoConversas.innerHTML = `
                <div class="historico-vazio">
                    Nenhuma conversa ainda.
                </div>
            `;

            return;
        }

        conversas.forEach(function (conversa) {

            criarItemHistorico(conversa);

        });

    } catch (erro) {

        console.error(
            "ERRO AO CARREGAR CONVERSAS:",
            erro
        );

        historicoConversas.innerHTML = `
            <div class="historico-vazio">
                ❌ Erro ao carregar histórico.
            </div>
        `;
    }
}


// ============================================================
// CRIAR ITEM DO HISTÓRICO
// ============================================================

function criarItemHistorico(conversa) {

    if (!historicoConversas) {
        return;
    }

    const id =
        conversa.id ??
        conversa.conversation_id;

    if (!id) {
        return;
    }

    const titulo =
        conversa.title ||
        conversa.titulo ||
        "Nova conversa";

    const item =
        document.createElement("div");

    item.className = "conversa-item";

    if (
        String(id) ===
        String(conversationId)
    ) {
        item.classList.add("ativa");
    }

    item.dataset.id = id;

    // --------------------------------------------------------
    // BOTÃO ABRIR
    // --------------------------------------------------------

    const abrir =
        document.createElement("button");

    abrir.type = "button";

    abrir.className = "conversa-abrir";

    abrir.title = titulo;

    abrir.innerHTML = `
        <span class="conversa-titulo">
            ${escaparHTML(titulo)}
        </span>
    `;

    abrir.addEventListener(
        "click",
        function () {

            abrirConversa(id);

        }
    );

    // --------------------------------------------------------
    // AÇÕES
    // --------------------------------------------------------

    const acoes =
        document.createElement("div");

    acoes.className =
        "conversa-acoes";

    // --------------------------------------------------------
    // RENOMEAR
    // --------------------------------------------------------

    const btnRenomear =
        document.createElement("button");

    btnRenomear.type = "button";

    btnRenomear.className =
        "btn-conversa btn-renomear";

    btnRenomear.title =
        "Renomear conversa";

    btnRenomear.textContent =
        "✏️";

    btnRenomear.addEventListener(
        "click",
        function (event) {

            event.preventDefault();
            event.stopPropagation();

            renomearConversa(
                id,
                titulo
            );
        }
    );

    // --------------------------------------------------------
    // EXCLUIR
    // --------------------------------------------------------

    const btnExcluir =
        document.createElement("button");

    btnExcluir.type = "button";

    btnExcluir.className =
        "btn-conversa btn-excluir";

    btnExcluir.title =
        "Excluir conversa permanentemente";

    btnExcluir.textContent =
        "🗑️";

    btnExcluir.addEventListener(
        "click",
        function (event) {

            event.preventDefault();
            event.stopPropagation();

            excluirConversa(id);

        }
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

    historicoConversas.appendChild(
        item
    );
}


// ============================================================
// ABRIR CONVERSA
// ============================================================

async function abrirConversa(id) {

    if (enviando) {
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
                        "Accept": "application/json"
                    }
                }
            );

        if (resposta.status === 401) {

            window.location.href = "/login";

            return;
        }

        const texto =
            await resposta.text();

        let dados;

        try {

            dados = JSON.parse(texto);

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

            throw new Error(
                dados.message ||
                "Não foi possível abrir a conversa."
            );
        }

        conversationId =
            dados.conversation_id ??
            dados.id ??
            id;

        window.conversationId =
            conversationId;

        if (chat) {
            chat.innerHTML = "";
        }

        removerTyping();

        limparArquivo();

        const mensagens =
            dados.messages ||
            dados.historico ||
            dados.history ||
            [];

        if (Array.isArray(mensagens)) {

            mensagens.forEach(
                function (item) {

                    const sender =
                        item.sender ||
                        item.role;

                    const texto =
                        item.message ??
                        item.content ??
                        "";

                    if (!texto) {
                        return;
                    }

                    if (
                        sender === "user" ||
                        sender === "human"
                    ) {

                        adicionarMensagem(
                            texto,
                            "user"
                        );

                    } else {

                        adicionarResposta(
                            texto,
                            false
                        );
                    }

                }
            );
        }

        const titulo =
            dados.title ||
            dados.titulo ||
            "Nova conversa";

        if (tituloConversa) {

            tituloConversa.textContent =
                titulo;
        }

        atualizarWelcome();

        atualizarItensAtivos();

        if (mensagemInput) {
            mensagemInput.focus();
        }

        chat.scrollTop =
            chat.scrollHeight;

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
// ATUALIZAR CONVERSA ATIVA
// ============================================================

function atualizarItensAtivos() {

    if (!historicoConversas) {
        return;
    }

    const itens =
        historicoConversas.querySelectorAll(
            ".conversa-item"
        );

    itens.forEach(function (item) {

        if (
            String(item.dataset.id) ===
            String(conversationId)
        ) {

            item.classList.add("ativa");

        } else {

            item.classList.remove("ativa");
        }
    });
}


// ============================================================
// RENOMEAR CONVERSA
// ============================================================

async function renomearConversa(id, tituloAtual) {

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
            "❌ O nome da conversa não pode ficar vazio."
        );

        return;
    }

    if (titulo.length > 100) {

        alert(
            "❌ O nome pode ter no máximo 100 caracteres."
        );

        return;
    }

    try {

        const resposta =
            await fetch(
                `/conversation/${encodeURIComponent(id)}`,
                {
                    method: "PUT",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json",
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        title: titulo
                    })
                }
            );

        const texto =
            await resposta.text();

        let dados = {};

        try {
            dados = JSON.parse(texto);
        } catch (erro) {
            console.warn(
                "Resposta não JSON:",
                texto
            );
        }

        if (!resposta.ok) {

            throw new Error(
                dados.message ||
                "Não foi possível renomear a conversa."
            );
        }

        if (
            String(id) ===
            String(conversationId)
        ) {

            if (tituloConversa) {

                tituloConversa.textContent =
                    titulo;
            }
        }

        await carregarListaConversas();

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
// EXCLUIR CONVERSA PERMANENTEMENTE
// ============================================================

async function excluirConversa(id) {

    const item =
        historicoConversas
            ? historicoConversas.querySelector(
                `.conversa-item[data-id="${CSS.escape(String(id))}"]`
            )
            : null;

    let titulo = "esta conversa";

    if (item) {

        const tituloElemento =
            item.querySelector(
                ".conversa-titulo"
            );

        if (tituloElemento) {

            titulo =
                tituloElemento.textContent.trim();
        }
    }

    const confirmar =
        confirm(
            `⚠️ Excluir conversa?\n\n` +
            `"${titulo}"\n\n` +
            `Essa ação apagará permanentemente ` +
            `a conversa e suas mensagens.\n\n` +
            `Essa ação não pode ser desfeita.`
        );

    if (!confirmar) {
        return;
    }

    try {

        const resposta =
            await fetch(
                `/conversation/${encodeURIComponent(id)}`,
                {
                    method: "DELETE",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        const texto =
            await resposta.text();

        let dados = {};

        try {
            dados =
                JSON.parse(texto);
        } catch (erro) {
            console.warn(
                "Resposta não JSON:",
                texto
            );
        }

        if (!resposta.ok) {

            throw new Error(
                dados.message ||
                "Não foi possível excluir a conversa."
            );
        }

        // ----------------------------------------------------
        // SE ERA A CONVERSA ATUAL
        // ----------------------------------------------------

        if (
            String(id) ===
            String(conversationId)
        ) {

            conversationId = null;

            window.conversationId =
                null;

            if (chat) {
                chat.innerHTML = "";
            }

            removerTyping();

            limparArquivo();

            if (tituloConversa) {

                tituloConversa.textContent =
                    "Orion AI";
            }

            atualizarWelcome();

            // Cria uma nova conversa
            await novaConversa();

        } else {

            await carregarListaConversas();
        }

        console.log(
            "Conversa excluída permanentemente:",
            id
        );

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
                JSON.parse(
                    textoResposta
                );

        } catch (erro) {

            console.error(
                "Resposta inválida:",
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

        conversationId =
            dados.conversation_id;

        window.conversationId =
            conversationId;

        if (chat) {
            chat.innerHTML = "";
        }

        removerTyping();

        if (mensagemInput) {
            mensagemInput.value = "";
        }

        limparArquivo();

        if (tituloConversa) {

            tituloConversa.textContent =
                dados.title ||
                "Nova conversa";
        }

        atualizarWelcome();

        await carregarListaConversas();

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

        if (conversationId) {

            dadosEnvio.conversation_id =
                conversationId;
        }

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

                dadosEnvio.image =
                    base64.split(",")[1];

                dadosEnvio.image_type =
                    arquivo.type;

            } else {

                if (typing) {
                    typing.remove();
                }

                adicionarResposta(
                    "❌ No momento, o Orion AI aceita apenas imagens JPG, PNG, WEBP ou GIF."
                );

                return;
            }
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
                JSON.parse(
                    textoResposta
                );

        } catch (erro) {

            console.error(
                "Resposta do /chat:",
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

            conversationId =
                dados.conversation_id;

            window.conversationId =
                conversationId;
        }

        adicionarResposta(
            dados.reply ||
            "Não recebi uma resposta da IA."
        );

        if (dados.title) {

            if (tituloConversa) {

                tituloConversa.textContent =
                    dados.title;
            }
        }

        limparArquivo();

        await carregarListaConversas();

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
// CONVERTER ARQUIVO PARA BASE64
// ============================================================

function converterArquivoBase64(arquivo) {

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

            if (
                arquivo.type &&
                !arquivo.type.startsWith("image/")
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

    arquivoSelecionado =
        null;

    if (arquivoInput) {

        arquivoInput.value =
            "";
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
// CARREGAR MENSAGENS DA CONVERSA ATUAL
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
            "ERRO AO CARREGAR HISTÓRICO:",
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

        atualizarWelcome();

        await carregarListaConversas();

        await carregarHistorico();

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

window.carregarListaConversas =
    carregarListaConversas;

window.abrirConversa =
    abrirConversa;

window.renomearConversa =
    renomearConversa;

window.excluirConversa =
    excluirConversa;
