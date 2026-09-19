#!/bin/bash

# --- CONFIGURAÇÃO ---
# Caminho absoluto para a pasta do projeto no computador
PROJETO_DIR="/home/leandro-sadala/Projetos/portal-vagas"
BRANCH="main" # Alterar para 'master' se necessário

# Entra na pasta do projeto
cd "$PROJETO_DIR" || { echo "Diretório não encontrado!"; exit 1; }

echo "=== Iniciando atualização de vagas e cursos ==="

# 1. Executa os scripts de scraping (localizados na pasta scrappers/)
echo "Executando raspagem de vagas..."
node scrappers/scraper_vagas.js

echo "Executando raspagem de cursos..."
node scrappers/scraper_cursos.js

# 2. Executa a limpeza de duplicatas (script Python na pasta curadoria/)
if [ -f "curadoria/limpar_duplicatas.py" ]; then
    echo "Executando limpeza de duplicatas..."
    python3 curadoria/limpar_duplicatas.py
fi

# 3. Verifica se os arquivos JSON em data/ foram gerados ou modificados
if [[ -n $(git status -s data/vagas.json data/cursos.json) ]]; then
    echo "Novos dados detectados. Preparando commit..."

    # Adiciona os arquivos atualizados da pasta data/
    git add data/vagas.json data/cursos.json

    # Realiza o commit com data e hora automática
    git commit -m "Auto-update: Atualização semanal de vagas e cursos ($(date +'%Y-%m-%d %H:%M'))"

    # Envia para o repositório remoto do GitHub
    git push origin "$BRANCH"

    echo "=== Deploy concluído com sucesso para o GitHub! ==="
else
    echo "Nenhuma alteração nos dados encontrada. Saindo."
fi