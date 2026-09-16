import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

let extractor = null;
let vagasDB = [];
let cursosDB = [];

// Função global para alternar entre as telas da aplicação
window.mostrarTela = function(idTela) {
    const telas = ['telaInicio', 'telaCadastro', 'telaSucesso', 'telaLogin', 'telaDashboard'];
    telas.forEach(t => {
        document.getElementById(t).classList.add('hidden');
    });
    document.getElementById(idTela).classList.remove('hidden');
}

// Inicialização do Sistema e Carregamento dos Dados de Vagas e Cursos
async function inicializarSistema() {
    try {
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        
        const resVagas = await fetch('vagas.json');
        const vagasRaw = await resVagas.json();
        vagasDB = vagasRaw.map(v => ({
            ...v,
            embeddings: typeof v.embeddings === 'string' ? JSON.parse(v.embeddings) : v.embeddings
        }));

        const resCursos = await fetch('cursos.json');
        const cursosRaw = await resCursos.json();
        cursosDB = cursosRaw.map(c => ({
            ...c,
            embeddings: typeof c.embeddings === 'string' ? JSON.parse(c.embeddings) : c.embeddings
        }));

        console.log(`Carregadas ${vagasDB.length} vagas e ${cursosDB.length} cursos com sucesso.`);
    } catch (error) {
        console.error("Erro ao inicializar IA ou carregar bases:", error);
    }
}

inicializarSistema();

// Geração de Código Alfanumérico de 6 Dígitos
function gerarCodigoUnico() {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let codigo = '';
    for (let i = 0; i < 6; i++) {
        codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return codigo;
}

// Função de Cadastro
window.cadastrarUsuario = function() {
    const nome = document.getElementById('nomeCadastro').value.trim();
    const senha = document.getElementById('senhaCadastro').value.trim();
    const perfil = document.getElementById('perfilCadastro').value.trim();

    if (!nome || !senha || !perfil) {
        alert("Por favor, preencha todos os campos do cadastro.");
        return;
    }

    let usuarios = JSON.parse(localStorage.getItem('usuariosDB')) || [];
    
    // Gera um código único garantindo que não repita
    let codigo;
    do {
        codigo = gerarCodigoUnico();
    } while (usuarios.some(u => u.codigo === codigo));

    const novoUsuario = { codigo, nome, senha, perfil };
    usuarios.push(novoUsuario);
    
    localStorage.setItem('usuariosDB', JSON.stringify(usuarios));

    // Exibe o código gerado na tela de sucesso
    document.getElementById('codigoGerado').innerText = codigo;
    mostrarTela('telaSucesso');
}

// Função de Login
window.fazerLogin = async function() {
    const codigoInput = document.getElementById('codigoLogin').value.trim().toUpperCase();
    const senhaInput = document.getElementById('senhaLogin').value.trim();
    const erroEl = document.getElementById('erroLogin');

    if (!codigoInput || !senhaInput) {
        erroEl.innerText = "Informe o código e a senha.";
        erroEl.classList.remove('hidden');
        return;
    }

    const usuarios = JSON.parse(localStorage.getItem('usuariosDB')) || [];
    const usuarioEncontrado = usuarios.find(u => u.codigo === codigoInput && u.senha === senhaInput);

    if (!usuarioEncontrado) {
        erroEl.innerText = "Código ou senha incorretos.";
        erroEl.classList.remove('hidden');
        return;
    }

    erroEl.classList.add('hidden');
    
    // Salva a sessão ativa
    localStorage.setItem('usuarioLogado', JSON.stringify(usuarioEncontrado));
    
    // Abre o Dashboard e executa a recomendação automática
    mostrarTela('telaDashboard');
    document.getElementById('saudacaoUsuario').innerText = `Olá, ${usuarioEncontrado.nome} (Código: ${usuarioEncontrado.codigo})`;
    
    await executarRecomendacaoAutomatica(usuarioEncontrado.perfil);
}

window.fazerLogout = function() {
    localStorage.removeItem('usuarioLogado');
    mostrarTela('telaInicio');
}

// Abre o painel de edição preenchendo com o perfil atual do usuário logado
window.abrirEdicaoPerfil = function() {
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (usuarioLogado) {
        document.getElementById('perfilEditado').value = usuarioLogado.perfil;
        document.getElementById('painelEdicao').classList.remove('hidden');
    }
}

// Fecha o painel de edição sem salvar
window.fecharEdicaoPerfil = function() {
    document.getElementById('painelEdicao').classList.add('hidden');
}

// Salva as alterações do perfil no localStorage e atualiza as recomendações
window.salvarPerfilEditado = async function() {
    const novoTextoPerfil = document.getElementById('perfilEditado').value.trim();

    if (!novoTextoPerfil) {
        alert("O campo de perfil não pode ficar vazio.");
        return;
    }

    let usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    let usuariosDB = JSON.parse(localStorage.getItem('usuariosDB')) || [];

    // Atualiza o perfil na sessão ativa
    usuarioLogado.perfil = novoTextoPerfil;
    localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));

    // Atualiza o perfil na lista geral de usuários cadastrados
    usuariosDB = usuariosDB.map(u => {
        if (u.codigo === usuarioLogado.codigo) {
            return { ...u, perfil: novoTextoPerfil };
        }
        return u;
    });
    localStorage.setItem('usuariosDB', JSON.stringify(usuariosDB));

    // Fecha o painel e roda a IA novamente com o novo perfil
    fecharEdicaoPerfil();
    await executarRecomendacaoAutomatica(usuarioLogado.perfil);
}

// Funções de Cálculo e Recomendação de IA
function calcularSimilaridade(vecA, vecB) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function gerarEstrelas(score) {
    let numEstrelas;
    if (score < 0.3) numEstrelas = 1;
    else if (score < 0.5) numEstrelas = 2;
    else if (score < 0.7) numEstrelas = 3;
    else if (score < 0.9) numEstrelas = 4;
    else numEstrelas = 5;

    let estrelasHtml = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= numEstrelas) {
            estrelasHtml += `<span class="text-amber-500">★</span>`;
        } else {
            estrelasHtml += `<span class="text-slate-300">☆</span>`;
        }
    }
    return `<span class="text-base" title="Aderência: ${Math.round(score * 100)}%">${estrelasHtml}</span>`;
}

/*
async function executarRecomendacaoAutomatica(textoPerfil) {
    const statusEl = document.getElementById('status');
    const resultadosEl = document.getElementById('resultados');

    statusEl.innerText = "Gerando vetor do seu perfil e cruzando com as vagas...";
    resultadosEl.innerHTML = "";

    if (!extractor) {
        statusEl.innerText = "Aguardando carregamento do modelo de IA...";
        while (!extractor) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    const output = await extractor(textoPerfil, { pooling: 'mean', normalize: true });
    const vetorUsuario = Array.from(output.data);

    const vagasComScore = vagasDB
        .filter(v => v.embeddings && Array.isArray(v.embeddings) && v.embeddings.length > 0)
        .map(v => {
            const score = calcularSimilaridade(vetorUsuario, v.embeddings);
            return { ...v, score };
        });

    vagasComScore.sort((a, b) => b.score - a.score);
    const top10 = vagasComScore.slice(0, 10);

    let html = "<h3 class='font-bold text-base text-slate-800 border-b pb-2 mb-4'>Top 10 Vagas Recomendadas para o seu Perfil:</h3>";
    
    top10.forEach((v, index) => {
        const estrelasHtml = gerarEstrelas(v.score);
        
        html += `
            <div class='p-4 border rounded-lg bg-slate-50 mb-4 shadow-sm'>
                <div class='flex justify-between items-center'>
                    <span class='font-semibold text-sm text-slate-900'>${index + 1}. ${v.vaga}</span>
                    <div class='flex items-center gap-1 bg-white px-2 py-1 rounded border'>
                        <span class='text-xs font-bold text-slate-600 mr-1'>Aderência:</span>
                        ${estrelasHtml}
                    </div>
                </div>
                <p class='text-xs text-slate-600 mt-2'>${v.descricao ? v.descricao.substring(0, 200) : ''}...</p>
                <div class='mt-3 flex justify-between items-center'>
                    <a href='${v.link}' target='_blank' class='text-xs text-blue-600 font-semibold underline'>Acessar Vaga Original</a>
                </div>
        `;

        if (v.score < 0.70 && cursosDB.length > 0) {
            const cursosComScore = cursosDB
                .filter(c => c.embeddings && Array.isArray(c.embeddings) && c.embeddings.length > 0)
                .map(c => {
                    const score = calcularSimilaridade(v.embeddings, c.embeddings);
                    return { ...c, score };
                });

            cursosComScore.sort((a, b) => b.score - a.score);
            const cursoSugerido = cursosComScore.length > 0 ? cursosComScore[0] : null;

            if (cursoSugerido && cursoSugerido.score >= 0.75) {
                html += `
                    <div class='mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md'>
                        <p class='text-xs font-bold text-amber-800'>💡 Oportunidade de Qualificação Recomendada:</p>
                        <p class='text-xs text-amber-900 mt-1'>Para elevar suas chances nesta vaga, recomendamos o curso:</p>
                        <p class='text-xs font-semibold text-slate-800 mt-1'>• ${cursoSugerido.curso}</p>
                        ${cursoSugerido.link ? `<a href='${cursoSugerido.link}' target='_blank' class='text-xs text-amber-700 underline mt-1 inline-block font-medium'>Ver detalhes do curso</a>` : ''}
                    </div>
                `;
            }
        }

        html += `</div>`;
    });

    resultadosEl.innerHTML = html;
    statusEl.innerText = "Análise concluída com sucesso!";
}
*/

/*
async function executarRecomendacaoAutomatica(textoPerfil) {
    const statusEl = document.getElementById('status');
    const resultadosEl = document.getElementById('resultados');

    statusEl.innerText = "Gerando vetor do seu perfil e cruzando com as vagas...";
    resultadosEl.innerHTML = "";

    if (!extractor) {
        statusEl.innerText = "Aguardando carregamento do modelo de IA...";
        while (!extractor) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    const output = await extractor(textoPerfil, { pooling: 'mean', normalize: true });
    const vetorUsuario = Array.from(output.data);

    const vagasComScore = vagasDB
        .filter(v => v.embeddings && Array.isArray(v.embeddings) && v.embeddings.length > 0)
        .map(v => {
            const score = calcularSimilaridade(vetorUsuario, v.embeddings);
            return { ...v, score };
        });

    vagasComScore.sort((a, b) => b.score - a.score);
    const top10 = vagasComScore.slice(0, 10);

    // TRATAMENTO PARA NENHUMA VAGA ENCONTRADA OU PERFIL FORA DO ESCOPO
    if (top10.length === 0 || top10[0].score < 0.20) {
        statusEl.innerText = "Análise concluída.";
        resultadosEl.innerHTML = `
            <div class='p-6 bg-amber-50 border border-amber-200 rounded-lg text-center space-y-3'>
                <h3 class='font-bold text-amber-800 text-base'>⚠️ Nenhuma vaga compatível encontrada</h3>
                <p class='text-xs text-amber-900'>
                    Não encontramos vagas correspondentes diretas para a descrição informada. Tente detalhar melhor o seu perfil profissional.
                </p>
                <div class='text-left bg-white p-3 rounded border border-amber-100 text-xs text-slate-700 space-y-1 inline-block w-full'>
                    <p class='font-bold text-slate-800 mb-1'>Dicas para melhorar seu perfil:</p>
                    <p>• <strong>Momento atual:</strong> Informe se é estudante ou busca recolocação.</p>
                    <p>• <strong>Objetivo:</strong> Especifique se procura estágio, emprego efetivo, etc.</p>
                    <p>• <strong>Áreas de interesse:</strong> Cite setores específicos (ex: atendimento, vendas, administração).</p>
                    <p>• <strong>Habilidades:</strong> Mencione ferramentas ou características fortes (ex: pacote Office, organização).</p>
                </div>
            </div>
        `;
        return;
    }

    let html = "<h3 class='font-bold text-base text-slate-800 border-b pb-2 mb-4'>Top 10 Vagas Recomendadas para o seu Perfil:</h3>";
    
    top10.forEach((v, index) => {
        const estrelasHtml = gerarEstrelas(v.score);
        
        html += `
            <div class='p-4 border rounded-lg bg-slate-50 mb-4 shadow-sm'>
                <div class='flex justify-between items-center'>
                    <span class='font-semibold text-sm text-slate-900'>${index + 1}. ${v.vaga}</span>
                    <div class='flex items-center gap-1 bg-white px-2 py-1 rounded border'>
                        <span class='text-xs font-bold text-slate-600 mr-1'>Aderência:</span>
                        ${estrelasHtml}
                    </div>
                </div>
                <p class='text-xs text-slate-600 mt-2'>${v.descricao ? v.descricao.substring(0, 200) : ''}...</p>
                <div class='mt-3 flex justify-between items-center'>
                    <a href='${v.link}' target='_blank' class='text-xs text-blue-600 font-semibold underline'>Acessar Vaga Original</a>
                </div>
        `;

        if (v.score < 0.70 && cursosDB.length > 0) {
            const cursosComScore = cursosDB
                .filter(c => c.embeddings && Array.isArray(c.embeddings) && c.embeddings.length > 0)
                .map(c => {
                    const score = calcularSimilaridade(v.embeddings, c.embeddings);
                    return { ...c, score };
                });

            cursosComScore.sort((a, b) => b.score - a.score);
            const cursoSugerido = cursosComScore.length > 0 ? cursosComScore[0] : null;

            if (cursoSugerido && cursoSugerido.score >= 0.75) {
                html += `
                    <div class='mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md'>
                        <p class='text-xs font-bold text-amber-800'>💡 Oportunidade de Qualificação Recomendada:</p>
                        <p class='text-xs text-amber-900 mt-1'>Para elevar suas chances nesta vaga, recomendamos o curso:</p>
                        <p class='text-xs font-semibold text-slate-800 mt-1'>• ${cursoSugerido.curso}</p>
                        ${cursoSugerido.link ? `<a href='${cursoSugerido.link}' target='_blank' class='text-xs text-amber-700 underline mt-1 inline-block font-medium'>Ver detalhes do curso</a>` : ''}
                    </div>
                `;
            }
        }

        html += `</div>`;
    });

    resultadosEl.innerHTML = html;
    statusEl.innerText = "Análise concluída com sucesso!";
}
*/

// Variável global para armazenar a lista completa de vagas recomendadas da sessão atual
let vagasRecomendadasAtuais = [];
let quantidadeExibida = 5;

async function executarRecomendacaoAutomatica(textoPerfil) {
    const statusEl = document.getElementById('status');
    const resultadosEl = document.getElementById('resultados');

    statusEl.innerText = "Gerando vetor do seu perfil e cruzando com as vagas...";
    resultadosEl.innerHTML = "";

    if (!extractor) {
        statusEl.innerText = "Aguardando carregamento do modelo de IA...";
        while (!extractor) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    const output = await extractor(textoPerfil, { pooling: 'mean', normalize: true });
    const vetorUsuario = Array.from(output.data);

    const vagasComScore = vagasDB
        .filter(v => v.embeddings && Array.isArray(v.embeddings) && v.embeddings.length > 0)
        .map(v => {
            const score = calcularSimilaridade(vetorUsuario, v.embeddings);
            return { ...v, score };
        });

    vagasComScore.sort((a, b) => b.score - a.score);
    vagasRecomendadasAtuais = vagasComScore.slice(0, 10); // Guarda até 10 na memória
    quantidadeExibida = 5; // Reseta para exibir 5 inicialmente

    if (vagasRecomendadasAtuais.length === 0 || vagasRecomendadasAtuais[0].score < 0.20) {
        statusEl.innerText = "Análise concluída.";
        resultadosEl.innerHTML = `
            <div class='p-6 bg-amber-50 border border-amber-200 rounded-lg text-center space-y-3'>
                <h3 class='font-bold text-amber-800 text-base'>⚠️ Nenhuma vaga compatível encontrada</h3>
                <p class='text-xs text-amber-900'>
                    Não encontramos vagas correspondentes diretas para a descrição informada. Tente detalhar melhor o seu perfil profissional.
                </p>
            </div>
        `;
        return;
    }

    renderizarListaVagas();
    statusEl.innerText = "Análise concluída com sucesso!";
}

// Função isolada para renderizar as vagas com base na quantidade visível
function renderizarListaVagas() {
    const resultadosEl = document.getElementById('resultados');
    const vagasParaMostrar = vagasRecomendadasAtuais.slice(0, quantidadeExibida);

    let html = "<h3 class='font-bold text-base text-slate-800 border-b pb-2 mb-4'>Vagas Recomendadas para o seu Perfil:</h3>";
    
    vagasParaMostrar.forEach((v, index) => {
        const estrelasHtml = gerarEstrelas(v.score);
        
        html += `
            <div class='p-4 border rounded-lg bg-slate-50 mb-4 shadow-sm'>
                <div class='flex justify-between items-center'>
                    <span class='font-semibold text-sm text-slate-900'>${index + 1}. ${v.vaga}</span>
                    <div class='flex items-center gap-1 bg-white px-2 py-1 rounded border'>
                        <span class='text-xs font-bold text-slate-600 mr-1'>Aderência:</span>
                        ${estrelasHtml}
                    </div>
                </div>
                <p class='text-xs text-slate-600 mt-2'>${v.descricao ? v.descricao.substring(0, 200) : ''}...</p>
                <div class='mt-3 flex justify-between items-center'>
                    <a href='${v.link}' target='_blank' class='text-xs text-blue-600 font-semibold underline'>Acessar Vaga Original</a>
                </div>
        `;

        if (v.score < 0.70 && cursosDB.length > 0) {
            const cursosComScore = cursosDB
                .filter(c => c.embeddings && Array.isArray(c.embeddings) && c.embeddings.length > 0)
                .map(c => {
                    const score = calcularSimilaridade(v.embeddings, c.embeddings);
                    return { ...c, score };
                });

            cursosComScore.sort((a, b) => b.score - a.score);
            const cursoSugerido = cursosComScore.length > 0 ? cursosComScore[0] : null;

            if (cursoSugerido && cursoSugerido.score >= 0.75) {
                html += `
                    <div class='mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md'>
                        <p class='text-xs font-bold text-amber-800'>💡 Oportunidade de Qualificação Recomendada:</p>
                        <p class='text-xs text-amber-900 mt-1'>Para elevar suas chances nesta vaga, recomendamos o curso:</p>
                        <p class='text-xs font-semibold text-slate-800 mt-1'>• ${cursoSugerido.curso}</p>
                        ${cursoSugerido.link ? `<a href='${cursoSugerido.link}' target='_blank' class='text-xs text-amber-700 underline mt-1 inline-block font-medium'>Ver detalhes do curso</a>` : ''}
                    </div>
                `;
            }
        }

        html += `</div>`;
    });

    // Se houver mais vagas para mostrar além das exibidas, adiciona o botão "Carregar Mais"
    if (quantidadeExibida < vagasRecomendadasAtuais.length) {
        html += `
            <button onclick="carregarMaisVagas()" class='w-full bg-slate-200 text-slate-700 p-3 rounded-lg font-semibold hover:bg-slate-300 transition mt-2'>
                Mostrar mais vagas recomendadas (${vagasRecomendadasAtuais.length - quantidadeExibida} restantes)
            </button>
        `;
    }

    resultadosEl.innerHTML = html;
}

// Função global chamada pelo botão para expandir a lista
window.carregarMaisVagas = function() {
    quantidadeExibida += 5; // Incrementa em blocos de 5
    renderizarListaVagas();
}

// Verifica se já existe sessão ativa ao abrir a página
window.addEventListener('DOMContentLoaded', () => {
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (usuarioLogado) {
        mostrarTela('telaDashboard');
        document.getElementById('saudacaoUsuario').innerText = `Olá, ${usuarioLogado.nome} (Código: ${usuarioLogado.codigo})`;
        executarRecomendacaoAutomatica(usuarioLogado.perfil);
    }
});