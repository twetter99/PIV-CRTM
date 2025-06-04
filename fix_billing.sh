#!/bin/bash
# Hacer backup
cp src/app/billing/page.tsx src/app/billing/page.tsx.backup

# Reemplazar la línea problemática
sed -i '28s/\.filter(panel => panel\.status === '\''installed'\'' && panel\.importe_mensual && panel\.importe_mensual > 0)/.filter(panel => panel.status === '\''installed'\'')/' src/app/billing/page.tsx

echo "Cambio realizado. Verificando..."
echo "Línea 28 ahora dice:"
sed -n '28p' src/app/billing/page.tsx
