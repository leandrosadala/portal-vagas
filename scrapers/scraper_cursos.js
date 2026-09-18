import { chromium } from 'playwright';
import { pipeline } from '@xenova/transformers';
import fs from 'fs';

// Função auxiliar para salvar ou mesclar os cursos de forma segura no JSON
function salvarCursosSeguro(novosCursos) {
    let cursosExistentes = [];
    
    if (fs.existsSync('cursos.json')) {
        try {
            const conteudo = fs.readFileSync('cursos.json', 'utf-8');
            if (conteudo.trim()) {
                cursosExistentes = JSON.parse(conteudo);
            }
        } catch (e) {
            console.error("Aviso: Não foi possível ler o cursos.json existente. Um novo será gerado.");
        }
    }

    const mapaCursos = new Map();
    cursosExistentes.forEach(c => mapaCursos.set(c.link, c));
    novosCursos.forEach(c => mapaCursos.set(c.link, c));

    const listaAtualizada = Array.from(mapaCursos.values());
    fs.writeFileSync('cursos.json', JSON.stringify(listaAtualizada, null, 2), 'utf-8');
}

async function rasparDetalhesCursoCPET(page, urlCurso) {
    try {
        await page.goto(urlCurso, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
        
        // Fecha eventuais modais ou pop-ups se aparecerem
        try {
            const botaoFecharModal = page.locator('button.absolute, button.close, svg.lucide-x, [class*="modal"] button').first();
            if (await botaoFecharModal.isVisible({ timeout: 2000 })) {
                await botaoFecharModal.click();
                await page.waitForTimeout(1000);
            }
        } catch (e) {}

        // Extrai os textos relevantes da página do curso
        const detalhesTexto = await page.evaluate(() => {
            let partes = [];

            // 1. Captura a descrição principal logo abaixo do título (baseada no seu print)
            const descPrincipal = document.querySelector('div.text-base.md\\:text-lg.text-white\\/85, div[class*="text-base"]');
            if (descPrincipal) {
                partes.push(descPrincipal.innerText.trim());
            }

            // 2. Captura textos de seções informativas complementares da página
            const secoes = document.querySelectorAll('main section');
            secoes.forEach(sec => {
                const textoSec = sec.innerText.trim();
                if (textoSec && !partes.includes(textoSec)) {
                    partes.push(textoSec);
                }
            });

            return partes.join(' ');
        });

        if (detalhesTexto && detalhesTexto.length > 0) {
            return detalhesTexto.replaceAll("\n", " ");
        }

        // Fallback genérico caso seletores específicos falhem
        const corpoGeral = await page.locator('main').innerText().catch(() => '');
        return corpoGeral.replaceAll("\n", " ");

    } catch (error) {
        console.error(`Erro ao acessar detalhes do curso CPET (${urlCurso}): ${error.message}`);
        return '';
    }
}

async function rasparCursosCPET() {
    console.log("Iniciando motor de IA para embeddings (all-MiniLM-L6-v2) - CPET...");
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let totalSalvosNestaExecucao = 0;
    const listaFinalCursos = [];

    try {
        const url = 'https://www.cpet.com.br/cursos-tecnicos';
        console.log(`\n============================================================`);
        console.log(`Acessando cursos técnicos CPET`);
        console.log(`============================================================`);

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(2000);

            const cursos = await page.evaluate(() => {
                const lista = [];
                const cards = document.querySelectorAll('div.group');

                cards.forEach(card => {
                    let tituloElem = card.querySelector('h2');
                    tituloElem = tituloElem ? tituloElem.innerText.trim() : 'Título não encontrado'
                    const linkElem = card.querySelector('a');
                    if (tituloElem !== 'Título não encontrado' && linkElem) {
                        lista.push({
                            titulo: tituloElem,
                            link: linkElem.href
                        });
                    }
                });

                return lista;
            });

            console.log(`Processando e salvando ${cursos.length} cursos ...`);

            for (const curso of cursos) {
                console.log(`Raspando detalhes: ${curso.titulo}`);
                curso.detalhes = await rasparDetalhesCursoCPET(page, curso.link);

                if (curso.titulo !== 'Título não encontrado') {
                    const textoParaVetorizar = `${curso.titulo}. ${curso.detalhes}`;
                    const output = await extractor(textoParaVetorizar, { pooling: 'mean', normalize: true });
                    const vectorJson = JSON.stringify(Array.from(output.data));

                    listaFinalCursos.push({
                        'curso': curso.titulo,
                        'link': curso.link,
                        'detalhes': curso.detalhes,
                        'embeddings': vectorJson
                    });
                    
                    totalSalvosNestaExecucao++;
                }
            }
        } catch (errorCursos) {
            console.error(`Erro ao processar cursos:`, errorCursos.message);
        }
        
        salvarCursosSeguro(listaFinalCursos);
        console.log(`\n✨ Concluído CPET: ${totalSalvosNestaExecucao} cursos vetorizados e salvos.`);
    } catch (error) {
        console.error("Erro geral na execução do script de cursos CPET:", error);
    } finally {
        await browser.close();
    }
}

async function rasparDetalhesCursoEstacio(browser, urlCurso) {
    const pageDetalhe = await browser.newPage();
    try {
        await pageDetalhe.goto(urlCurso, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await pageDetalhe.waitForTimeout(3000);

        // Lista completa de data-sections presentes na página de detalhes do curso
        const dataSections = [
            'section_sobre-o-cursos',
            'section_aprenda-excel',
            'section_button-big-number',
            'section_objetivos-do-curso',
            'section_formacao-pratica-e-direta',
            'section_perfil-profissional',
            'section_carousel'
        ];

        // Constrói os seletores dinamicamente para cada data-section na página de detalhes
        const seletoresDinamicos = [];
        dataSections.forEach(section => {
            seletoresDinamicos.push(`[data-section="${section}"] h2`);
            seletoresDinamicos.push(`[data-section="${section}"] h3`);
            seletoresDinamicos.push(`[data-section="${section}"] p`);
        });

        const elementos = pageDetalhe.locator(seletoresDinamicos.join(', '));
        
        const count = await elementos.count();
        if (count > 0) {
            let textos = [];
            for (let i = 0; i < count; i++) {
                const texto = await elementos.nth(i).innerText();
                if (texto && texto.trim() !== '') {
                    const textoLimpo = texto.trim().replaceAll("\n", " ");
                    // Evita adicionar textos duplicados
                    if (!textos.includes(textoLimpo)) {
                        textos.push(textoLimpo);
                    }
                }
            }
            await pageDetalhe.close();
            return textos.join(' ');
        }
        await pageDetalhe.close();
        return '';
    } catch (error) {
        console.error(`Erro ao acessar detalhes do curso (${urlCurso}): ${error.message}`);
        await pageDetalhe.close();
        return '';
    }
}

async function rasparCursosEstacio() {
    console.log("Iniciando motor de IA para embeddings (all-MiniLM-L6-v2) - Estácio...");
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let totalSalvosNestaExecucao = 0;
    const listaFinalCursos = [];

    const urlsParaRaspar = [
        'https://estacio.br/cursos-livres',
        'https://estacio.br/cursos-tecnicos-e-profissionalizantes'
    ];

    try {
        for (const url of urlsParaRaspar) {
            console.log(`\n============================================================`);
            console.log(`Acessando URL de listagem: ${url}`);
            console.log(`============================================================`);

            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForTimeout(3000);

                let tentativas = 0;
                const maxTentativas = 50;

                // Loop para carregar todos os itens da página clicando em "mostrar mais"
                while (tentativas < maxTentativas) {
                    const botaoCarregar = page.locator('#btn-load-more').filter({ hasText: /mostrar mais/i }).first();

                    if (await botaoCarregar.isVisible()) {
                        try {
                            await botaoCarregar.scrollIntoViewIfNeeded();
                            await botaoCarregar.click();
                            await page.waitForTimeout(2000);
                            tentativas++;
                        } catch (err) {
                            await page.waitForTimeout(1000);
                        }
                    } else {
                        break;
                    }
                }

                // Na página de listagem, recolhemos todos os cartões disponíveis
                const cursos = await page.evaluate(() => {
                    const lista = [];
                    const cards = document.querySelectorAll('div.list-cards .MuiGrid-item');

                    cards.forEach(card => {
                        const tituloElem = card.querySelector('h3');
                        const linkElem = card.querySelector('a');
                        
                        if (tituloElem && linkElem && linkElem.href && !lista.some(c => c.link === linkElem.href)) {
                            const titulo = tituloElem.innerText.trim();
                            if (titulo.length > 3) {
                                lista.push({
                                    titulo: titulo,
                                    link: linkElem.href
                                });
                            }
                        }
                    });

                    return lista;
                });

                console.log(`Processando e salvando ${cursos.length} cursos desta URL...`);

                for (const curso of cursos) {
                    console.log(`Raspando detalhes: ${curso.titulo}`);
                    curso.detalhes = await rasparDetalhesCursoEstacio(browser, curso.link);

                    if (curso.titulo !== 'Título não encontrado') {
                        const textoParaVetorizar = `${curso.titulo}. ${curso.detalhes}`;
                        const output = await extractor(textoParaVetorizar, { pooling: 'mean', normalize: true });
                        const vectorJson = JSON.stringify(Array.from(output.data));

                        listaFinalCursos.push({
                            'curso': curso.titulo,
                            'link': curso.link,
                            'detalhes': curso.detalhes,
                            'embeddings': vectorJson
                        });
                        
                        totalSalvosNestaExecucao++;
                    }
                }
            } catch (errorUrl) {
                console.error(`Erro ao processar a URL ${url}:`, errorUrl.message);
            }
        }
        
        salvarCursosSeguro(listaFinalCursos);
        console.log(`\n✨ Concluído Estácio: ${totalSalvosNestaExecucao} cursos vetorizados e salvos no total.`);
    } catch (error) {
        console.error("Erro geral na execução do script de cursos Estácio:", error);
    } finally {
        await browser.close();
    }
}

async function rasparDetalhesCursoUninter(page, urlCurso) {
    try {
        await page.goto(urlCurso, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Extrai o texto apenas de h2 e p dentro de #section0, #section1, #section2 e #section3
        const detalhesTexto = await page.evaluate(() => {
            let partes = [];

            // Percorre de section0 até section3
            for (let i = 0; i <= 3; i++) {
                const secao = document.querySelector(`#section${i}`);
                if (secao) {
                    const elementos = secao.querySelectorAll('h2, p');
                    elementos.forEach(el => {
                        const texto = el.innerText.trim();
                        if (texto && !partes.includes(texto)) {
                            partes.push(texto);
                        }
                    });
                }
            }

            return partes.join(' ');
        });

        if (detalhesTexto && detalhesTexto.length > 0) {
            return detalhesTexto.replaceAll("\n", " ").replace(/\s+/g, " ").trim();
        }

        return '';
    } catch (error) {
        console.error(`Erro ao acessar detalhes do curso Uninter (${urlCurso}): ${error.message}`);
        return '';
    }
}

async function rasparCursosUninter() {
    console.log("Iniciando motor de IA para embeddings (all-MiniLM-L6-v2) - Uninter...");
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let totalSalvosNestaExecucao = 0;
    const listaFinalCursos = [];

    try {
        const urlBase = 'https://uninter.com/cursos-tecnicos-e-profissionalizantes';
        const totalPaginas = 6; // Sabemos que são 6 páginas no total
        
        // Monta a lista completa de URLs de 1 a 6 de forma programática
        const urlsPaginas = [urlBase];
        for (let p = 2; p <= totalPaginas; p++) {
            urlsPaginas.push(`${urlBase}/page/${p}/`);
        }

        console.log(`\n============================================================`);
        console.log(`Acessando Uninter (Varredura Sequencial de 1 a ${totalPaginas} páginas)`);
        console.log(`============================================================`);

        const todosCursosColetados = [];

        // Varre cada URL de página sequencialmente
        for (let i = 0; i < urlsPaginas.length; i++) {
            const paginaUrl = urlsPaginas[i];
            console.log(`Processando página ${i + 1} de ${urlsPaginas.length} (${paginaUrl})...`);

            await page.goto(paginaUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(2000);

            // Fecha o banner de cookies se estiver visível na primeira página
            if (i === 0) {
                try {
                    const botaoAceitarCookies = page.locator('button:has-text("Aceitar todos os cookies"), button:has-text("Rejeitar Todos")').first();
                    if (await botaoAceitarCookies.isVisible({ timeout: 3000 })) {
                        await botaoAceitarCookies.click();
                        await page.waitForTimeout(1000);
                        console.log("Banner de cookies fechado com sucesso.");
                    }
                } catch (e) {}
            }

            // Rola até o final para garantir renderização dos elementos
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(1500);

            const cursosPagina = await page.evaluate(() => {
                const lista = [];
                const cards = document.querySelectorAll('a.course');

                cards.forEach(card => {
                    const spanElem = card.querySelector('span.name');

                    if (card.href && spanElem) {
                        const titulo = spanElem.innerText.trim();
                        if (titulo.length > 2 && !lista.some(c => c.link === card.href)) {
                            lista.push({
                                titulo: titulo,
                                link: card.href
                            });
                        }
                    }
                });

                return lista;
            });

            console.log(`Encontrados ${cursosPagina.length} cursos nesta página.`);

            for (const curso of cursosPagina) {
                if (!todosCursosColetados.some(c => c.link === curso.link)) {
                    todosCursosColetados.push(curso);
                }
            }
        }

        console.log(`\n✨ Total de cursos únicos coletados em todas as páginas: ${todosCursosColetados.length}. Iniciando extração de detalhes...`);

        // Visita cada link coletado para extrair detalhes e gerar embeddings
        for (const curso of todosCursosColetados) {
            console.log(`Raspando detalhes (${totalSalvosNestaExecucao + 1}/${todosCursosColetados.length}): ${curso.titulo}`);
            curso.detalhes = await rasparDetalhesCursoUninter(page, curso.link);

            if (curso.titulo) {
                const textoParaVetorizar = `${curso.titulo}. ${curso.detalhes}`;
                const output = await extractor(textoParaVetorizar, { pooling: 'mean', normalize: true });
                const vectorJson = JSON.stringify(Array.from(output.data));

                listaFinalCursos.push({
                    'curso': curso.titulo,
                    'link': curso.link,
                    'detalhes': curso.detalhes,
                    'embeddings': vectorJson
                });
                
                totalSalvosNestaExecucao++;
            }
        }

        salvarCursosSeguro(listaFinalCursos);
        console.log(`\n✨ Concluído Uninter: ${totalSalvosNestaExecucao} cursos vetorizados e salvos.`);
    } catch (error) {
        console.error("Erro geral na execução do script de cursos Uninter:", error);
    } finally {
        await browser.close();
    }
}

async function executarScrapers() {
    await rasparCursosCPET();
    await rasparCursosEstacio();
    await rasparCursosUninter();
}

executarScrapers();