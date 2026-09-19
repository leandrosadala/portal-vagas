import json
import os

def remover_duplicadas(caminho_arquivo, chave_unica):
    if not os.path.exists(caminho_arquivo):
        print(f"Arquivo {caminho_arquivo} não encontrado.")
        return

    with open(caminho_arquivo, 'r', encoding='utf-8') as f:
        dados = json.load(f)

    total_inicial = len(dados)
    vistos = set()
    dados_unicos = []

    for item in dados:
        # Define o identificador único (prioriza o link, se houver, senão usa o título/nome)
        identificador = item.get(chave_unica) or item.get('vaga') or item.get('curso')
        
        # Normaliza removendo espaços extras
        if identificador:
            identificador = identificador.strip().lower()

        if identificador and identificador not in vistos:
            vistos.add(identificador)
            dados_unicos.append(item)
        elif not identificador:
            # Caso não tenha identificador claro, mantém para não perder dados
            dados_unicos.append(item)

    total_final = len(dados_unicos)
    removidos = total_inicial - total_final

    # Salva o arquivo limpo
    with open(caminho_arquivo, 'w', encoding='utf-8') as f:
        json.dump(dados_unicos, f, ensure_ascii=False, indent=4)

    print(f"[{caminho_arquivo}] Total inicial: {total_inicial} | Removidas: {removidos} duplicadas | Total final: {total_final}")

if __name__ == "__main__":
    # Aponta para os ficheiros dentro da pasta data/
    remover_duplicadas('data/vagas.json', 'link')
    remover_duplicadas('data/cursos.json', 'link')