#!/bin/bash

# Script de Deploy para GitHub Pages e Vercel
# Instruções:
# 1. Substitua os tokens no arquivo .env
# 2. Execute este script

echo "🚀 Iniciando deploy do Coach Hypertrophy..."

# Verificar se os tokens estão configurados
if [ ! -f .env ]; then
    echo "❌ Arquivo .env não encontrado!"
    echo "Copie e edite o arquivo .env.example e renomeie para .env"
    echo "Ou adicione manualmente as variáveis:"
    echo "  GITHUB_TOKEN=seu_github_token"
    echo "  VERCEL_TOKEN=seu_vercel_token"
    exit 1
fi

# Carregar variáveis de ambiente
source .env

echo "✅ Tokens carregados!"

# Adicionar arquivos ao Git
echo "📦 Adicionando arquivos ao Git..."
git add .

# Commit das alterações
echo "📝 Fazer commit das alterações..."
git commit -m "Atualização: novas funcionalidades de edição de treino"

# Push para o repositório
echo "🔀 Push para o GitHub..."
git push origin main

echo "✅ Deploy concluído!"
echo ""
echo "🌐 Seu app estará disponível em:"
echo "   https://kadashihi-art.github.io/coach-hypertrophy"
