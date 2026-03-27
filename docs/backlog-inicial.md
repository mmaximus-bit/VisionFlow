# Backlog Inicial - VisionFlow

Objetivo desta fase: entregar um MVP funcional de navegacao touchless com biometria de maos e base pronta para evolucao.

## Sugestao de colunas no Kanban

- Backlog
- Ready
- In Progress
- Review
- Done

## Legenda de prioridade

- P0: Critico para MVP
- P1: Importante para qualidade de uso
- P2: Evolucao apos MVP

## Epic 1 - Fundacao Tecnica

### VF-001 - Estruturar ambiente local de execucao
- Prioridade: P0
- Tipo: chore
- Estimativa: 1 ponto
- Descricao: Padronizar execucao local com servidor HTTP e instrucoes no README.
- Criterios de aceite:
  - Projeto inicia localmente sem erros.
  - Passo a passo de execucao documentado.
  - Time consegue rodar sem dependencia extra complexa.
- Dependencias: nenhuma

### VF-002 - Configurar padrao de branches e PR
- Prioridade: P0
- Tipo: chore
- Estimativa: 2 pontos
- Descricao: Formalizar fluxo main/dev/feature/hotfix e padrao minimo de PR.
- Criterios de aceite:
  - Fluxo de branch documentado.
  - Checklist de PR definido.
  - Revisao obrigatoria ativa no repositorio.
- Dependencias: VF-001

### VF-003 - Criar base de observabilidade no front
- Prioridade: P1
- Tipo: chore
- Estimativa: 2 pontos
- Descricao: Implementar logs de eventos principais (camera ativa, mao detectada, clique por pinca, perda de rastreio).
- Criterios de aceite:
  - Eventos principais sao registrados.
  - Logs podem ser ativados/desativados por flag simples.
- Dependencias: VF-001

## Epic 2 - Motor de Interacao por Maos (MVP)

### VF-010 - Captura de camera robusta
- Prioridade: P0
- Tipo: feature
- Estimativa: 3 pontos
- Descricao: Garantir fluxo confiavel de permissao e inicializacao da webcam.
- Criterios de aceite:
  - Exibe status claro quando permissao for negada.
  - Exibe status claro quando camera estiver ativa.
  - Nao quebra em navegadores sem suporte.
- Dependencias: VF-001

### VF-011 - Movimento de cursor com suavizacao
- Prioridade: P0
- Tipo: feature
- Estimativa: 5 pontos
- Descricao: Melhorar estabilidade do cursor com filtro de suavizacao para reduzir tremor.
- Criterios de aceite:
  - Cursor responde aos movimentos sem saltos extremos.
  - Latencia percebida continua aceitavel.
  - Parametros de suavizacao sao ajustaveis.
- Dependencias: VF-010

### VF-012 - Clique por pinca com debounce
- Prioridade: P0
- Tipo: feature
- Estimativa: 3 pontos
- Descricao: Evitar cliques duplicados por ruido do gesto de pinca.
- Criterios de aceite:
  - Um gesto gera no maximo um clique por ciclo.
  - Estado visual de clique permanece consistente.
- Dependencias: VF-011

### VF-013 - Scroll por gesto vertical com limites
- Prioridade: P0
- Tipo: feature
- Estimativa: 3 pontos
- Descricao: Implementar scroll previsivel por faixa vertical da mao com ganho configuravel.
- Criterios de aceite:
  - Scroll sobe e desce com consistencia.
  - Sensibilidade pode ser calibrada.
  - Nao dispara scroll involuntario constante.
- Dependencias: VF-011

## Epic 3 - UX e Acessibilidade Inicial

### VF-020 - Estados de interface e onboarding rapido
- Prioridade: P1
- Tipo: feature
- Estimativa: 3 pontos
- Descricao: Criar estados visuais para aguardando camera, detectando mao, controle ativo e erro.
- Criterios de aceite:
  - Usuario entende o que fazer em cada estado.
  - Mensagens curtas e claras em pt-BR.
- Dependencias: VF-010

### VF-021 - Feedback visual de confianca de rastreio
- Prioridade: P1
- Tipo: feature
- Estimativa: 2 pontos
- Descricao: Exibir indicador simples da qualidade de rastreio para orientar o usuario.
- Criterios de aceite:
  - Indicador muda quando rastreio piora/melhora.
  - UX nao polui a tela.
- Dependencias: VF-011

### VF-022 - Suporte minimo a teclado como fallback
- Prioridade: P1
- Tipo: feature
- Estimativa: 2 pontos
- Descricao: Permitir navegacao basica por teclado se camera falhar.
- Criterios de aceite:
  - Usuario consegue navegar sem webcam.
  - Fluxo principal permanece touchless quando camera ativa.
- Dependencias: VF-020

## Epic 4 - Privacidade e Seguranca de Dados

### VF-030 - Politica de processamento local
- Prioridade: P0
- Tipo: chore
- Estimativa: 2 pontos
- Descricao: Documentar que o processamento de video e local e nao armazena biometria por padrao.
- Criterios de aceite:
  - Secao de privacidade no README e docs.
  - Linguagem clara para usuario final.
- Dependencias: VF-001

### VF-031 - Banner de consentimento informado
- Prioridade: P1
- Tipo: feature
- Estimativa: 3 pontos
- Descricao: Exibir consentimento antes de iniciar camera, com resumo de uso de dados.
- Criterios de aceite:
  - Camera so inicia apos aceite.
  - Usuario pode revogar e encerrar captura.
- Dependencias: VF-010, VF-030

## Epic 5 - Qualidade e Validacao

### VF-040 - Roteiro de testes manuais do MVP
- Prioridade: P0
- Tipo: test
- Estimativa: 2 pontos
- Descricao: Criar checklist de testes para camera, cursor, clique e scroll em desktop e mobile.
- Criterios de aceite:
  - Checklist em docs com casos felizes e falhas comuns.
  - Evidencia de execucao inicial registrada.
- Dependencias: VF-010, VF-011, VF-012, VF-013

### VF-041 - Matriz de compatibilidade de navegadores
- Prioridade: P1
- Tipo: test
- Estimativa: 2 pontos
- Descricao: Validar comportamento em Chrome, Edge e Firefox (desktop).
- Criterios de aceite:
  - Matriz publicada em docs.
  - Problemas conhecidos listados com workaround.
- Dependencias: VF-040

### VF-042 - Hardening de performance inicial
- Prioridade: P1
- Tipo: chore
- Estimativa: 3 pontos
- Descricao: Ajustar frequencia de processamento e reduzir travamentos em maquinas medianas.
- Criterios de aceite:
  - Uso de CPU estabilizado em cenario medio.
  - Interface continua responsiva durante rastreio.
- Dependencias: VF-011, VF-013

## Epic 6 - Preparacao para Integracao com Gemini

### VF-050 - Definir camada de abstracao para IA
- Prioridade: P1
- Tipo: architecture
- Estimativa: 3 pontos
- Descricao: Criar contrato simples para integrar evolucoes com Gemini sem acoplar a UI.
- Criterios de aceite:
  - Interface de modulo de IA definida.
  - UI consome apenas contrato abstrato.
- Dependencias: VF-001

### VF-051 - Prototipo de evento inteligente
- Prioridade: P2
- Tipo: spike
- Estimativa: 3 pontos
- Descricao: Explorar um caso inicial (exemplo: ajuste automatico de sensibilidade por contexto).
- Criterios de aceite:
  - Experimento documentado com resultado.
  - Decisao de seguir, ajustar ou descartar.
- Dependencias: VF-050

## Ordem recomendada de implementacao (primeiras sprints)

### Sprint 1 (MVP base)
- VF-001
- VF-010
- VF-011
- VF-012
- VF-013
- VF-040

### Sprint 2 (UX + privacidade)
- VF-020
- VF-021
- VF-030
- VF-031
- VF-041

### Sprint 3 (qualidade + evolucao)
- VF-003
- VF-022
- VF-042
- VF-050
- VF-051

## Labels sugeridas no GitHub

- type:feature
- type:chore
- type:test
- type:architecture
- type:spike
- priority:P0
- priority:P1
- priority:P2
- status:blocked
- area:tracking
- area:ux
- area:privacy
- area:performance
- area:docs

## Definition of Done (DoD)

- Criterios de aceite atendidos
- Revisao de codigo concluida
- Atualizacao de documentacao necessaria realizada
- Testes manuais essenciais executados
- Sem regressao critica no fluxo touchless
