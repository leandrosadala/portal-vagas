# Portal de Vagas e Cursos - Rio de Janeiro

Plataforma web estática desenvolvida com Inteligência Artificial (*Client-Side*) voltada para apoiar a inserção profissional e a inclusão digital de jovens e adultos em situação de vulnerabilidade no município do Rio de Janeiro. 

O projeto foi concebido como MVP (Mínimo Produto Viável) para a **Atividade Extensionista II** do curso de Análise e Desenvolvimento de Sistemas da Uninter.

🔗 **Acesse a aplicação online:** [GitHub Pages](https://leandrosadala.github.io/portal-vagas)

---

## 🎯 Objetivos do Projeto

1. **Gestão e Autenticação Local:** Oferecer uma aplicação web responsiva que permita o cadastro e o gerenciamento de perfis profissionais diretamente no navegador do usuário, utilizando `LocalStorage` para garantir total privacidade e controle dos dados.
2. **Recomendação Inteligente Descentralizada (*Client-Side AI*):** Integrar a biblioteca `@xenova/transformers` com o modelo de *embeddings* semânticos `all-MiniLM-L6-v2`, executando o cruzamento vetorial diretamente no dispositivo do cliente, sem necessidade de um servidor de *backend* dedicado.
3. **Pipeline de Coleta Automatizada (*Scraping*):** Extrair, normalizar e estruturar dados de oportunidades de emprego e qualificação a partir de fontes públicas e regionais do Rio de Janeiro, consolidando-os em bases JSON consumidas pelo motor de recomendação.

---

## 🏗️ Arquitetura do Repositório

O projeto adota uma arquitetura 100% estática hospedada via **GitHub Pages**, dividindo-se entre a camada de apresentação no *frontend*, os motores de processamento de dados e os scripts de ingestão.

### Estrutura de Pastas e Arquivos

```text
portal-vagas/
│
├── index.html                           # Página principal da aplicação web
├── app.js                               # Lógica principal do frontend, autenticação e motor de IA
│
├── scrappers/                           # Scripts de extração e coleta de dados (Web Scraping)
│   ├── scraper_vagas.js                 # Extrator de vagas de emprego do portal Riovagas
│   └── scraper_cursos.js                # Extrator de cursos dos sites CPET, Estácio e Uninter.
│
├── auto/                                # Automação e agendamento de atualizações do sistema
│   ├── atualizar_vagas_cursos.sh        # Shell script para execução da atualização de vagas e cursos
│   ├── atualizar_vagas_cursos.service   # Arquivo de configuração de serviço do Systemd (Linux)
│   └── atualizar_vagas_cursos.timer     # Arquivo de agendamento/timer do Systemd (Linux)
│
├── curadoria/                           # Tratamento a posteriori da raspagem dos dados
│   └── limpar_duplicatas.py             # Script Python para eliminação de vagas e cursos duplicados
│
└── data/                                # Bases de dados consolidadas para consumo da aplicação
    ├── vagas.json                       # Repositório estruturado de vagas de emprego
    └── cursos.json                      # Repositório estruturado de cursos e qualificação
