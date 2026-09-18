#!/bin/bash

# --- CONFIGURAÇÃO ---
# Caminho absoluto para a pasta do projeto no computador
PROJETO_DIR="/home/leandro-sadala/Projetos/portal-vagas" # "/caminho/para/projeto/aqui"
BRANCH="main" # Alterar para 'master' se necessário

# Entra na pasta do projeto
cd "$PROJETO_DIR" || { echo "Diretório não encontrado!"; exit 1; }

echo "=== Iniciando atualização de vagas e cursos ==="

# 1. Executa os seus scripts de scraping
node scraper_vagas.js
node scraper_cursos.js

# 2. Verifica se os arquivos JSON foram gerados/modificados
if [[ -n $(git status -s vagas.json cursos.json) ]]; then
    echo "Novos dados detectados. Preparando commit..."

    # Adiciona os arquivos atualizados
    git add vagas.json cursos.json

    # Realiza o commit com data e hora automática
    git commit -m "Auto-update: Atualização semanal de vagas e cursos ($(date +'%Y-%m-%d %H:%M'))"

    # Envia para o repositório remoto do GitHub
    git push origin "$BRANCH"

    echo "=== Deploy concluído com sucesso para o GitHub! ==="
else
    echo "Nenhuma alteração nos dados encontrada. Saindo."
fi