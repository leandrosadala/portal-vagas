import { chromium } from 'playwright';
import { pipeline } from '@xenova/transformers';
import fs from 'fs';

/**
 * Função responsável por acessar a página de uma vaga específica, 
 * extrair o conteúdo dos parágrafos delimitados entre div.veja-tambem e div.row, 
 * e retornar o texto limpo unificado.
 */
async function extrairConteudoCompletoVaga(page, urlVaga) {
    const detalhePage = await page.context().newPage();
    try {
        await detalhePage.goto(urlVaga, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await detalhePage.waitForTimeout(1500);
        
        const conteudoFinal = await detalhePage.evaluate(() => {
            const entryContent = document.querySelector('div.entry-content');
            if (!entryContent) return '';

            const vejaTambem = entryContent.querySelector('div.veja-tambem');
            const rowElement = entryContent.querySelector('div.row');

            const paragraphs = [];
            let collecting = !vejaTambem;

            for (const child of entryContent.children) {
                if (vejaTambem && child === vejaTambem) {
                    collecting = true;
                    continue;
                }
                if (rowElement && child === rowElement) {
                    break;
                }
                if (collecting) {
                    if (child.tagName === 'P') {
                        const text = child.innerText.trim();
                        if (text.length > 0) {
                            paragraphs.push(text);
                        }
                    }
                }
            }

            if (paragraphs.length === 0) {
                const allP = entryContent.querySelectorAll('p');
                allP.forEach(p => {
                    const text = p.innerText.trim();
                    if (text.length > 0) {
                        paragraphs.push(text);
                    }
                });
            }

            return paragraphs.join(' ');
        });

        await detalhePage.close();
        return conteudoFinal;
    } catch (error) {
        console.error(`Erro ao acessar ou delimitar detalhes da vaga (${urlVaga}): ${error.message}`);
        await detalhePage.close();
        return '';
    }
}

/**
 * Filtro inteligente baseado na estrutura previsível dos títulos de vagas reais.
 * Vagas reais utilizam hífens (-) para separar Cargo - Empresa/Setor - Salário - Local.
 * Artigos de blog, horóscopos e notícias costumam usar dois-pontos (:), interrogações (?) ou frases corridas.
 */
function ehVagaDeEmpregoValida(titulo) {
    if (!titulo || typeof titulo !== 'string') return false;
    const tituloLower = titulo.toLowerCase();

    // 1. Termos explicitamente proibidos (lixo comum do portal)
    const termosProibidos = [
        'horóscopo', 'tarot', 'signos', 'previsão', 'previsões', 
        'inss', 'benefícios', 'doação', 'medula', 'depressão', 
        'ansiedade', 'chá', 'receita', 'carne', 'dicas'
    ];

    for (const termo of termosProibidos) {
        if (tituloLower.includes(termo)) {
            return false;
        }
    }

    // 2. Validação Estrutural: Títulos de vagas reais quase sempre possuem hífens separando os metadados.
    // Exemplo: "Motorista de Micro – Transporte – R$ 3.221,24"
    const contemHifen = titulo.includes('-') || titulo.includes('–') || titulo.includes('—');
    
    // 3. Artigos de blog costumam usar dois-pontos (:) ou pontos de interrogação (?) no título (ex: "Horóscopo do dia: ...")
    const contemDoisPontos = titulo.includes(':');
    const contemInterrogacao = titulo.includes('?');

    if (contemDoisPontos || contemInterrogacao) {
        return false;
    }

    // Se tem hífens estruturais e passou nas restrições, é uma vaga real.
    return contemHifen;
}

/**
 * Função principal que gerencia a varredura das páginas de listagem de vagas 
 * por escolaridade, executa o filtro, extrai os detalhes e gera os embeddings.
 */
async function buscarVagasPorEscolaridade() {
    console.log("Iniciando motor de IA para embeddings (all-MiniLM-L6-v2)...");
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    const escolaridades = ['ensino-fundamental', 'ensino-medio'];
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    const maxPaginas = 60;
    let totalSalvasNestaExecucao = 0;
    const listaFinalVagas = [];

    try {
        for (const escolaridade of escolaridades) {
            for (let paginaAtual = 1; paginaAtual <= maxPaginas; paginaAtual++) {
                const url = paginaAtual === 1 
                    ? `https://riovagas.com.br/?=${escolaridade}+no+rio+de+janeiro` 
                    : `https://riovagas.com.br/page/${paginaAtual}/?=${escolaridade}+no+rio+de+janeiro`;
                
                console.log(`\n=================================================================`);
                console.log(`Acessando vagas associadas ao: [ ${escolaridade.toUpperCase()} ] - Página ${paginaAtual}`);
                console.log(`=================================================================`);

                try {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await page.waitForTimeout(2000);

                    const noResults = await page.locator('text="Nenhum resultado encontrado"').count();
                    if (noResults > 0) {
                        console.log(`Nenhum resultado encontrado. Pulando.`);
                        break;
                    }

                    const vagasElements = await page.locator('article').all();
                    const linksDaPagina = [];

                    for (const vaga of vagasElements) {
                        const linkElement = vaga.locator('h2 a');
                        if (await linkElement.count() > 0) {
                            const titulo = await linkElement.innerText();
                            const linkVaga = await linkElement.getAttribute('href');
                            
                            // Aplica a validação estrutural por hífens e exclusão de lixo
                            if (ehVagaDeEmpregoValida(titulo)) {
                                linksDaPagina.push({ titulo: titulo.trim(), link: linkVaga });
                                console.log(`[Vaga Válida Aprovada] ${titulo.trim()}`);
                            } else {
                                console.log(`[Filtrado estruturalmente] Rejeitado: ${titulo.trim()}`);
                            }
                        }
                    }

                    console.log(`Encontradas ${linksDaPagina.length} vagas estruturalmente válidas. Raspando detalhes...`);

                    for (const item of linksDaPagina) {
                        console.log(`- Raspando: ${item.titulo}`);
                        const conteudoEfetivo = await extrairConteudoCompletoVaga(page, item.link);

                        if (item.titulo !== "" && conteudoEfetivo !== "") {
                            const textoParaVetorizar = `${item.titulo}. ${conteudoEfetivo}`;
                            const output = await extractor(textoParaVetorizar, { pooling: 'mean', normalize: true });
                            const vectorJson = JSON.stringify(Array.from(output.data));

                            listaFinalVagas.push({
                                'vaga': item.titulo,
                                'link': item.link,
                                'descricao': conteudoEfetivo,
                                'embeddings': vectorJson
                            });

                            totalSalvasNestaExecucao++;
                        }

                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                } catch (errorPage) {
                    console.error(`Ocorreu um erro ao processar esta página: ${errorPage.message}`);
                }
            }
        }

        fs.writeFileSync('vagas.json', JSON.stringify(listaFinalVagas, null, 2), 'utf-8');
        console.log(`\n✨ Concluído: ${totalSalvasNestaExecucao} vagas vetorizadas e salvas no arquivo vagas.json.`);
    } catch (error) {
        console.error(`Erro geral no processo: ${error.message}`);
    } finally {
        await browser.close();
    }
}

buscarVagasPorEscolaridade();