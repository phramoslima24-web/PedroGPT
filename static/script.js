
// ============================================================
// ORION AI - SCRIPT.JS
// ============================================================

let enviando = false;
let vozesDisponiveis = [];
let arquivoAtual = null;


// ============================================================
// ELEMENTOS
// ============================================================

function elemento(id) {
    return document.getElementById(id);
}


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
// LIMPAR ASPAS TRIPLAS
// ============================================================

function limparAspasTriplas(texto) {

    if (!texto) {
        return "";
    }

    return String(texto)
        .replace(/^\s*'''(?:\w+)?\s*/, "")
        .replace(/\s*'''\s*$/, "")
        .trim();
}


// ============================================================
// FORMATAR RESPOSTA
// ============================================================

function formatarResposta(texto) {

    if (!texto) {
        return "";
    }

    texto = limparAspasTriplas(texto);

    let protegido = escaparHTML(texto);

    const blocosCodigo = [];

    protegido = protegido.replace(
        /```([a-zA-Z0-9_+#.-]*)\s*\n?([\s\S]*?)```/g,
        function (_, linguagem, codigo) {

            const id = blocosCodigo.length;

            blocosCodigo.push(
                `<pre class="codigo-pedrogpt"><code>${codigo.trim()}</code></pre>`
            );

            return `___CODIGO_${id}___`;
        }
    );

    protegido = protegido.replace(
        /\*\*(.+?)\*\*/g,
        "<strong>$1</strong>"
    );

    protegido = protegido.replace(
        /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
        "<em>$1</em>"
    );

    protegido = protegido.replace(
        /^### (.+)$/gm,
        "<h4>$1</h4>"
    );

    protegido = protegido.replace(
        /^## (.+)$/gm,
        "<h3>$1</h3>"
    );

    protegido = protegido.replace(
        /^# (.+)$/gm,
        "<h2>$1</h2>"
    );

    const linhas = protegido.split("\n");

    let resultado = "";
    let listaAberta = false;
    let listaNumeradaAberta = false;

    linhas.forEach(function (linha) {

        const trim = linha.trim();

        if (!trim) {

            if (listaAberta) {
                resultado += "</ul>";
                listaAberta = false;
            }

            if (listaNumeradaAberta) {
                resultado += "</ol>";
                listaNumeradaAberta = false;
            }

            resultado += '<div class="quebra-linha"></div>';

            return;
        }

        if (/^[-•*]\s+/.test(trim)) {

            if (listaNumeradaAberta) {
                resultado += "</ol>";
                listaNumeradaAberta = false;
            }

            if (!listaAberta) {
                resultado += "<ul>";
                listaAberta = true;
            }

            resultado += `<li>${trim.replace(/^[-•*]\s+/, "")}</li>`;

            return;
        }

        if (/^\d+[.)]\s+/.test(trim)) {

            if (listaAberta) {
                resultado += "</ul>";
                listaAberta = false;
            }

            if (!listaNumeradaAberta) {
                resultado += "<ol>";
                listaNumeradaAberta = true;
            }

            resultado += `<li>${trim.replace(/^\d+[.)]\s+/, "")}</li>`;

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

        resultado += `<div class="linha-resposta">${linha}</div>`;
    });

    if (listaAberta) {
        resultado += "</ul>";
    }

    if (listaNumeradaAberta) {
        resultado += "</ol>";
    }

    blocosCodigo.forEach(function (codigo, index) {

        resultado = resultado.replace(
            `___CODIGO_${index}___`,
            codigo
        );

    });

    return resultado;
}


// ============================================================
// WELCOME
// ============================================================

function esconderWelcome() {

    const welcome = elemento("welcome");

    if (welcome) {
        welcome.classList.add("hidden");
    }
}


function mostrarWelcome() {

    const welcome = elemento("welcome");

    if (welcome) {
        welcome.classList.remove("hidden");
    }
}


// ============================================================
// SCROLL
// ============================================================

function scrollBottom() {

    const chat = elemento("chat");

    if (!chat) {
        return;
    }

    requestAnimationFrame(function () {
        chat.scrollTop = chat.scrollHeight;
    });
}


// ============================================================
// COPIAR
// ============================================================

async function copiarMensagem(texto, botao) {

    try {

        if (
            navigator.clipboard &&
            window.isSecureContext
        ) {

            await navigator.clipboard.writeText(texto);

        } else {

            const area =
                document.createElement("textarea");

            area.value = texto;

            area.style.position = "fixed";
            area.style.left = "-9999px";

            document.body.appendChild(area);

            area.focus();
            area.select();

            document.execCommand("copy");

            area.remove();
        }

        const original =
            botao.textContent;

        botao.textContent =
            "✅ Copiado!";

        setTimeout(function () {

            botao.textContent =
                original;

        }, 1500);

    } catch (erro) {

        console.error(
            "Erro ao copiar:",
            erro
        );

        alert(
            "Não foi possível copiar."
        );
    }
}


// ============================================================
// VOZ
// ============================================================

function carregarVozes() {

    const seletor =
        elemento("seletorVoz");

    if (!seletor) {
        return;
    }

    // Se o navegador não suporta voz,
    // não bloqueia o restante do aplicativo.
    if (!("speechSynthesis" in window)) {

        seletor.innerHTML =
            '<option value="">Voz não suportada</option>';

        return;
    }

    let vozes =
        window.speechSynthesis.getVoices();

    // Alguns navegadores demoram para disponibilizar
    // as vozes.
    if (!vozes || vozes.length === 0) {

        seletor.innerHTML =
            '<option value="">Voz indisponível neste navegador</option>';

        return;
    }

    vozesDisponiveis = vozes;

    const salva =
        localStorage.getItem("orion_voz");

    vozes = [...vozes].sort(function (a, b) {

        const aPT =
            a.lang.toLowerCase().startsWith("pt");

        const bPT =
            b.lang.toLowerCase().startsWith("pt");

        if (aPT && !bPT) return -1;
        if (!aPT && bPT) return 1;

        return a.name.localeCompare(b.name);
    });

    seletor.innerHTML = "";

    vozes.forEach(function (voz) {

        const option =
            document.createElement("option");

        const indice =
            vozesDisponiveis.indexOf(voz);

        option.value =
            indice;

        option.textContent =
            `${voz.name} (${voz.lang})`;

        seletor.appendChild(option);

        if (
            salva &&
            voz.name === salva
        ) {

            option.selected = true;
        }
    });

    // Se não tiver voz salva,
    // tenta escolher português do Brasil.
    if (!salva) {

        const brasileira =
            vozes.find(function (voz) {

                return voz.lang
                    .toLowerCase()
                    .includes("pt-br");

            });

        if (brasileira) {

            seletor.value =
                vozesDisponiveis.indexOf(
                    brasileira
                );

        } else {

            const portugues =
                vozes.find(function (voz) {

                    return voz.lang
                        .toLowerCase()
                        .startsWith("pt");

                });

            if (portugues) {

                seletor.value =
                    vozesDisponiveis.indexOf(
                        portugues
                    );
            }
        }
    }
}


// ============================================================
// INICIALIZAR VOZ
// ============================================================

function iniciarSistemaDeVoz() {

    const seletor =
        elemento("seletorVoz");

    if (!seletor) {
        return;
    }

    if (!("speechSynthesis" in window)) {

        seletor.innerHTML =
            '<option value="">Voz não suportada</option>';

        return;
    }

    // Mostra imediatamente que o sistema foi iniciado.
    seletor.innerHTML =
        '<option value="">Carregando...</option>';

    carregarVozes();

    // Chrome/Edge normalmente usam este evento.
    window.speechSynthesis.onvoiceschanged =
        function () {

            carregarVozes();

        };

    // Tenta novamente algumas vezes porque
    // alguns navegadores não disparam o evento.
    let tentativas = 0;

    const intervalo =
        setInterval(function () {

            carregarVozes();

            tentativas++;

            if (
                vozesDisponiveis.length > 0 ||
                tentativas >= 10
            ) {

                clearInterval(intervalo);
            }

        }, 500);
}


// ============================================================
// VOZ SELECIONADA
// ============================================================

function obterVozSelecionada() {

    const seletor =
        elemento("seletorVoz");

    if (!seletor) {
        return null;
    }

    const indice =
        Number(seletor.value);

    return (
        vozesDisponiveis[indice] ||
        null
    );
}


// ============================================================
// SALVAR VOZ
// ============================================================

function salvarVozSelecionada() {

    const voz =
        obterVozSelecionada();

    if (!voz) {
        return;
    }

    localStorage.setItem(
        "orion_voz",
        voz.name
    );
}


// ============================================================
// TESTAR VOZ
// ============================================================

function testarVoz() {

    if (!("speechSynthesis" in window)) {

        alert(
            "Seu navegador não suporta voz."
        );

        return;
    }

    const voz =
        obterVozSelecionada();

    window.speechSynthesis.cancel();

    const fala =
        new SpeechSynthesisUtterance(
            "Olá! Eu sou a Orion AI."
        );

    fala.lang =
        voz?.lang || "pt-BR";

    fala.rate = 1;
    fala.pitch = 1;

    if (voz) {
        fala.voice = voz;
    }

    window.speechSynthesis.speak(
        fala
    );
}


// ============================================================
// FALAR RESPOSTA
// ============================================================

function falarResposta(texto) {

    const opcao =
        elemento("voz");

    if (
        !opcao ||
        !opcao.checked
    ) {
        return;
    }

    if (
        !("speechSynthesis" in window)
    ) {
        return;
    }

    const voz =
        obterVozSelecionada();

    window.speechSynthesis.cancel();

    const fala =
        new SpeechSynthesisUtterance(
            limparAspasTriplas(texto)
        );

    fala.lang =
        voz?.lang || "pt-BR";

    fala.rate = 1;
    fala.pitch = 1;

    if (voz) {
        fala.voice = voz;
    }

    window.speechSynthesis.speak(
        fala
    );
}


// ============================================================
// ADICIONAR MENSAGEM
// ============================================================

function addMensagem(
    texto,
    tipo,
    imagem = null
) {

    const chat =
        elemento("chat");

    if (!chat) {
        return null;
    }

    const div =
        document.createElement("div");

    const ehUsuario =
        tipo === "user";

    const ehTyping =
        tipo.includes("typing");

    div.classList.add(
        ehUsuario
            ? "msg-user"
            : "msg-bot"
    );

    if (ehTyping) {

        div.classList.add(
            "typing-message"
        );

        div.innerHTML = `
            <div class="conteudo-mensagem">
                <span>🤖 Orion AI está digitando</span>
                <span class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </span>
            </div>
        `;

        chat.appendChild(div);

        scrollBottom();

        return div;
    }

    const agora =
        new Date();

    const hora =
        String(agora.getHours())
            .padStart(2, "0")
        +
        ":"
        +
        String(agora.getMinutes())
            .padStart(2, "0");

    let conteudo = "";

    if (imagem) {

        conteudo += `
            <img
                src="${imagem}"
                style="
                    display:block;
                    max-width:280px;
                    max-height:300px;
                    border-radius:12px;
                    margin-bottom:8px;
                    object-fit:contain;
                    cursor:pointer;
                "
                alt="Imagem enviada"
                onclick="abrirImagem(this.src)"
            >
        `;
    }

    if (ehUsuario) {

        conteudo +=
            escaparHTML(texto)
                .replace(/\n/g, "<br>");

    } else {

        conteudo +=
            formatarResposta(texto);
    }

    div.innerHTML = `
        <div class="conteudo-mensagem">
            ${conteudo}
        </div>

        <div class="hora-mensagem"
             style="
                font-size:10px;
                opacity:0.5;
                margin-top:5px;
                text-align:right;
             ">
            ${hora}
        </div>

        ${
            !ehUsuario
            ? `
                <button
                    type="button"
                    class="copiar-mensagem"
                    style="
                        margin-top:8px;
                        padding:5px 9px;
                        border-radius:8px;
                        border:1px solid rgba(255,255,255,0.1);
                        background:rgba(255,255,255,0.06);
                        color:white;
                        cursor:pointer;
                        font-size:11px;
                    "
                >
                    📋 Copiar
                </button>
            `
            : ""
        }
    `;

    if (!ehUsuario) {

        const botao =
            div.querySelector(
                ".copiar-mensagem"
            );

        if (botao) {

            botao.addEventListener(
                "click",
                function () {

                    copiarMensagem(
                        limparAspasTriplas(texto),
                        botao
                    );

                }
            );
        }
    }

    chat.appendChild(div);

    scrollBottom();

    return div;
}


// ============================================================
// ABRIR IMAGEM
// ============================================================

function abrirImagem(src) {

    if (!src) {
        return;
    }

    const fundo =
        document.createElement("div");

    fundo.style.cssText = `
        position:fixed;
        inset:0;
        background:rgba(0,0,0,0.85);
        display:flex;
        align-items:center;
        justify-content:center;
        z-index:99999;
        padding:20px;
        cursor:zoom-out;
    `;

    const imagem =
        document.createElement("img");

    imagem.src = src;

    imagem.style.cssText = `
        max-width:95%;
        max-height:95%;
        object-fit:contain;
        border-radius:12px;
    `;

    fundo.appendChild(imagem);

    fundo.onclick =
        function () {
            fundo.remove();
        };

    document.body.appendChild(fundo);
}


// ============================================================
// ARQUIVOS
// ============================================================

function configurarArquivos() {

    const btn =
        elemento("btnArquivo");

    const input =
        elemento("arquivo");

    if (!btn || !input) {
        return;
    }

    btn.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            input.click();

        }
    );

    input.addEventListener(
        "change",
        function () {

            if (
                !input.files ||
                !input.files.length
            ) {
                return;
            }

            arquivoAtual =
                input.files[0];

            const nome =
                elemento("nomeArquivo");

            const container =
                elemento("arquivoSelecionado");

            if (nome) {
                nome.textContent =
                    arquivoAtual.name;
            }

            if (container) {
                container.classList.add(
                    "ativo"
                );
            }

            if (
                arquivoAtual.type &&
                arquivoAtual.type.startsWith("image/")
            ) {

                const leitor =
                    new FileReader();

                leitor.onload =
                    function (evento) {

                        let preview =
                            elemento("previewArquivo");

                        if (!preview) {

                            preview =
                                document.createElement("img");

                            preview.id =
                                "previewArquivo";

                            preview.style.cssText = `
                                width:55px;
                                height:55px;
                                object-fit:cover;
                                border-radius:8px;
                                margin-right:8px;
                            `;

                            if (container) {
                                container.prepend(
                                    preview
                                );
                            }
                        }

                        preview.src =
                            evento.target.result;
                    };

                leitor.readAsDataURL(
                    arquivoAtual
                );
            }

            esconderWelcome();
        }
    );

    const remover =
        elemento("removerArquivo");

    if (remover) {

        remover.addEventListener(
            "click",
            limparArquivoSelecionado
        );
    }
}


// ============================================================
// LIMPAR ARQUIVO
// ============================================================

function limparArquivoSelecionado() {

    const input =
        elemento("arquivo");

    const container =
        elemento("arquivoSelecionado");

    const nome =
        elemento("nomeArquivo");

    const preview =
        elemento("previewArquivo");

    if (input) {
        input.value = "";
    }

    arquivoAtual = null;

    if (nome) {
        nome.textContent =
            "Nenhum arquivo selecionado";
    }

    if (container) {
        container.classList.remove(
            "ativo"
        );
    }

    if (preview) {
        preview.remove();
    }
}


// ============================================================
// HISTÓRICO
// ============================================================

async function carregarHistorico() {

    try {

        const resposta =
            await fetch(
                "/history",
                {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (
            resposta.status === 401 ||
            !resposta.ok
        ) {
            return;
        }

        const historico =
            await resposta.json();

        const chat =
            elemento("chat");

        if (!chat) {
            return;
        }

        chat.innerHTML = "";

        if (
            !Array.isArray(historico) ||
            historico.length === 0
        ) {

            mostrarWelcome();

            return;
        }

        esconderWelcome();

        historico.forEach(function (item) {

            addMensagem(
                item?.message || "",
                item?.sender === "user"
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


// ============================================================
// ENVIAR
// ============================================================

async function enviar() {

    if (enviando) {
        return;
    }

    const campo =
        elemento("mensagem");

    const botao =
        elemento("btnEnviar");

    if (!campo) {

        console.error(
            "Campo #mensagem não encontrado."
        );

        return;
    }

    const texto =
        campo.value.trim();

    if (
        !texto &&
        !arquivoAtual
    ) {

        campo.focus();

        return;
    }

    enviando = true;

    esconderWelcome();

    let imagemPreview = null;
    let imagemBase64 = null;
    let tipoImagem = null;

    try {

        // ====================================================
        // IMAGEM
        // ====================================================

        if (arquivoAtual) {

            if (
                arquivoAtual.type &&
                arquivoAtual.type.startsWith("image/")
            ) {

                imagemPreview =
                    await arquivoParaDataURL(
                        arquivoAtual
                    );

                imagemBase64 =
                    imagemPreview;

                tipoImagem =
                    arquivoAtual.type;

            } else {

                addMensagem(
                    "❌ Selecione uma imagem válida.",
                    "bot"
                );

                return;
            }
        }

        // ====================================================
        // MOSTRAR USUÁRIO
        // ====================================================

        addMensagem(
            texto,
            "user",
            imagemPreview
        );

        campo.value = "";

        limparArquivoSelecionado();

        if (botao) {

            botao.disabled = true;

            botao.textContent =
                "Enviando...";
        }

        const typing =
            addMensagem(
                "",
                "bot typing"
            );

        // ====================================================
        // REQUISIÇÃO
        // ====================================================

        const resposta =
            await fetch(
                "/chat",
                {
                    method: "POST",

                    credentials:
                        "same-origin",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Accept":
                            "application/json"
                    },

                    body: JSON.stringify({

                        message:
                            texto,

                        image:
                            imagemBase64,

                        image_type:
                            tipoImagem

                    })
                }
            );

        if (typing) {
            typing.remove();
        }

        let data = {};

        try {
            data =
                await resposta.json();
        } catch (erroJSON) {

            console.error(
                "Resposta não é JSON:",
                erroJSON
            );
        }

        if (!resposta.ok) {

            const erro =
                data.reply ||
                data.message ||
                data.error ||
                `Erro do servidor (${resposta.status}).`;

            addMensagem(
                `❌ ${erro}`,
                "bot"
            );

            return;
        }

        const respostaTexto =
            limparAspasTriplas(
                data.reply ||
                data.response ||
                ""
            );

        if (!respostaTexto) {

            addMensagem(
                "❌ A IA não retornou uma resposta.",
                "bot"
            );

            return;
        }

        addMensagem(
            respostaTexto,
            "bot"
        );

        falarResposta(
            respostaTexto
        );

        await carregarConversas();

    } catch (erro) {

        console.error(
            "ERRO AO ENVIAR:",
            erro
        );

        addMensagem(
            "❌ Erro ao conectar com o servidor. Verifique o Render e tente novamente.",
            "bot"
        );

    } finally {

        enviando = false;

        if (botao) {

            botao.disabled = false;

            botao.textContent =
                "Enviar";
        }

        campo.focus();
    }
}


// ============================================================
// ARQUIVO -> DATA URL
// ============================================================

function arquivoParaDataURL(arquivo) {

    return new Promise(
        function (resolve, reject) {

            const leitor =
                new FileReader();

            leitor.onload =
                function (evento) {

                    resolve(
                        evento.target.result
                    );

                };

            leitor.onerror =
                reject;

            leitor.readAsDataURL(
                arquivo
            );

        }
    );
}


// ============================================================
// ATALHO
// ============================================================

function atalho(texto) {

    const campo =
        elemento("mensagem");

    if (!campo) {
        return;
    }

    esconderWelcome();

    campo.value =
        texto;

    campo.focus();
}


// ============================================================
// NOVA CONVERSA
// ============================================================

async function novaConversa() {

    if (enviando) {

        alert(
            "Aguarde a resposta atual terminar."
        );

        return;
    }

    try {

        const resposta =
            await fetch(
                "/new_chat",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        const data =
            await resposta.json();

        if (
            !resposta.ok ||
            !data.success
        ) {

            alert(
                data.message ||
                "Erro ao criar conversa."
            );

            return;
        }

        const chat =
            elemento("chat");

        if (chat) {
            chat.innerHTML = "";
        }

        mostrarWelcome();

        limparArquivoSelecionado();

        if (
            "speechSynthesis" in window
        ) {

            window.speechSynthesis.cancel();
        }

        const titulo =
            elemento("tituloConversa");

        if (titulo) {
            titulo.textContent =
                "Orion AI";
        }

        await carregarConversas();

    } catch (erro) {

        console.error(
            "Erro nova conversa:",
            erro
        );

        alert(
            "Erro ao conectar com o servidor."
        );
    }
}


// ============================================================
// CONVERSAS
// ============================================================

async function carregarConversas() {

    const lista =
        elemento("conversas");

    if (!lista) {
        return;
    }

    try {

        const resposta =
            await fetch(
                "/conversations",
                {
                    credentials:
                        "same-origin",
                    cache:
                        "no-store",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (
            resposta.status === 401 ||
            !resposta.ok
        ) {
            return;
        }

        const conversas =
            await resposta.json();

        lista.innerHTML = "";

        if (!Array.isArray(conversas)) {
            return;
        }

        const atual =
            await obterConversaAtual();

        conversas.forEach(
            function (conversa) {

                const item =
                    document.createElement("button");

                item.type = "button";

                item.className =
                    "conversa-item";

                item.dataset.id =
                    conversa.id;

                item.textContent =
                    conversa.title ||
                    "Nova conversa";

                if (
                    String(conversa.id) ===
                    String(atual)
                ) {

                    item.classList.add(
                        "ativa"
                    );
                }

                item.addEventListener(
                    "click",
                    function () {

                        abrirConversa(
                            conversa.id
                        );

                    }
                );

                lista.appendChild(item);
            }
        );

    } catch (erro) {

        console.error(
            "Erro conversas:",
            erro
        );
    }
}


// ============================================================
// CONVERSA ATUAL
// ============================================================

async function obterConversaAtual() {

    try {

        const resposta =
            await fetch(
                "/api/status",
                {
                    credentials:
                        "same-origin",
                    cache:
                        "no-store"
                }
            );

        if (!resposta.ok) {
            return null;
        }

        const data =
            await resposta.json();

        return data.conversation_id ?? null;

    } catch (erro) {

        console.error(
            "Erro status:",
            erro
        );

        return null;
    }
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
                    credentials:
                        "same-origin",
                    cache:
                        "no-store",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        const data =
            await resposta.json();

        if (
            !resposta.ok ||
            !data.success
        ) {

            alert(
                data.message ||
                "Erro ao abrir conversa."
            );

            return;
        }

        const chat =
            elemento("chat");

        if (!chat) {
            return;
        }

        chat.innerHTML = "";

        const titulo =
            elemento("tituloConversa");

        if (titulo) {

            titulo.textContent =
                data.title ||
                "Orion AI";
        }

        const mensagens =
            data.messages || [];

        if (!mensagens.length) {

            mostrarWelcome();

        } else {

            esconderWelcome();

            mensagens.forEach(
                function (item) {

                    addMensagem(
                        item.message || "",
                        item.sender === "user"
                            ? "user"
                            : "bot"
                    );

                }
            );
        }

        document
            .querySelectorAll(
                ".conversa-item"
            )
            .forEach(
                function (item) {

                    item.classList.toggle(
                        "ativa",
                        String(item.dataset.id) ===
                        String(id)
                    );

                }
            );

        scrollBottom();

    } catch (erro) {

        console.error(
            "Erro abrir conversa:",
            erro
        );

        alert(
            "Erro ao conectar com o servidor."
        );
    }
}


// ============================================================
// ENTER
// ============================================================

function configurarEnter() {

    const campo =
        elemento("mensagem");

    if (!campo) {
        return;
    }

    campo.addEventListener(
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
// FORMULÁRIO
// ============================================================

function configurarFormulario() {

    const campo =
        elemento("mensagem");

    if (!campo) {
        return;
    }

    campo.addEventListener(
        "input",
        function () {

            campo.style.height =
                "auto";

            campo.style.height =
                Math.min(
                    campo.scrollHeight,
                    180
                ) + "px";
        }
    );
}


// ============================================================
// VOZ
// ============================================================

function configurarVoz() {

    const opcao =
        elemento("voz");

    if (opcao) {

        opcao.addEventListener(
            "change",
            function () {

                if (
                    !opcao.checked &&
                    "speechSynthesis" in window
                ) {

                    window.speechSynthesis.cancel();
                }

            }
        );
    }

    const seletor =
        elemento("seletorVoz");

    if (seletor) {

        seletor.addEventListener(
            "change",
            function () {

                salvarVozSelecionada();

                if (
                    "speechSynthesis" in window
                ) {

                    window.speechSynthesis.cancel();
                }

            }
        );
    }

    const testar =
        elemento("btnTestarVoz");

    if (testar) {

        testar.addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                testarVoz();

            }
        );
    }

    iniciarSistemaDeVoz();
}


// ============================================================
// BOTÃO ENVIAR
// ============================================================

function configurarBotaoEnviar() {

    const botao =
        elemento("btnEnviar");

    if (!botao) {

        console.error(
            "Botão #btnEnviar não encontrado."
        );

        return;
    }

    botao.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            enviar();

        }
    );
}


// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        console.log(
            "Orion AI iniciado."
        );

        configurarEnter();

        configurarBotaoEnviar();

        configurarVoz();

        configurarFormulario();

        configurarArquivos();

        await carregarHistorico();

        await carregarConversas();

        const campo =
            elemento("mensagem");

        if (campo) {
            campo.focus();
        }

    }
);
