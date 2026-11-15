---
type: Concept
title: "Firespire — diseño de producto e interfaz"
description: "Vistas y componentes de Firespire (globo de quemas, calendario armonizado, museo, anomalía), interacción, color, idioma y reglas sobre datos simulados."
tags: ["firespire", "nasa-space-apps-2026", "diseno"]
sources:
  - "https://claude.ai/artifact/XPRqtykRPtg739raoefXci"
  - "/inbox/resumen-contexto-modis-viirs-2026-11-14.md"
origin_default: relato
privacy: open
status: draft
generated:
  by: "andy/claude-code"
  at: "2026-11-14T21:05:00-03:00"
---
# Resumen
- Hay **dos prototipos** con focos distintos:
  - **Globo de quemas** (este repo, `index.html`): exploración operativa del período reciente, con alertas y planificación.
  - **Calendario de quemas v5** ([artifact](https://claude.ai/artifact/XPRqtykRPtg739raoefXci)): serie histórica armonizada, calendario mes × año y diagnóstico de calibración.
- El challenge pide sobre todo lo segundo. La propuesta es un solo producto: **el globo como entrada y mapa; el calendario armonizado como núcleo; el museo y la anomalía encima**. Fernando tiene que confirmarla (ver [decisiones](decisiones.md)). [hipótesis]

# Estructura propuesta [hipótesis]
| Vista | Para qué | Base |
|---|---|---|
| **History** (calendario armonizado) | Estacionalidad, años de más fuego, mes actual vs. mediana; descarga | Calendario v5 |
| **Map** (globo / H3) | Dónde: selección de área, focos por período, capas por FRP | Globo de quemas |
| **Fire museum** | 3–5 incendios históricos: ficha, curvas MODIS / VIIRS / armonizado, mapa con control de tiempo, descarga | Nuevo |
| **Today** | "Is this fire normal?": anomalía del período actual contra la línea base | Alertas del globo + línea base |
| **Method** | Cómo se armoniza: factores por régimen, gráfico antes/después, error de validación | Diagnóstico del v5 |

La vista "Planificación" del globo (zonas prioritarias, envío de alertas a cuarteles) queda fuera del núcleo; ver Datos simulados.

# Componentes existentes
## Globo de quemas
- **Filtros:** año, país (solo Argentina), provincia, día/noche, confianza mínima (baja/nominal/alta), período semana/mes/año con navegación ‹ ›, día puntual.
- **Modos de mapa:** hexágonos H3, mapa de calor, áreas (borde hexagonal, centros, suavizado, envolvente convexa); grilla con slider de resolución H3 2–5; mapa base satelital, oscuro o nocturno; rotación que se pausa con filtros activos.
- **Capas de intensidad** por cortes de FRP.
- **Panel:** pestañas Resumen y Alertas; calendario del año, del mes y tarjetas semanales.
- **Alertas** con cinco niveles: Bajo, Moderado, Alto, Muy alto, Extremo.

## Calendario v5
- Filtros: presets de período, rango de meses, fuente (armonizado / MODIS crudo / VIIRS crudo), métrica (celda-días, promedio diario, anomalía %), área (presets regionales o dibujada).
- KPIs, calendario año × mes con clic para filtrar, vista tabla, métrica diaria, mapa con selección por arrastre y diagnóstico de armonización.
- Meses provisorios (NRT) con rayado.

# Interacción
- Estado de filtros en la URL, para compartir una vista. [hipótesis]
- Selección de área: rectángulo o polígono dibujado → `polygon_to_cells`; presets por provincia (ya existen en el globo) y regionales (v5).
- Cada vista con su descarga: CSV de agregados, CSV de detecciones (máx. 31 días) y **export PNG/SVG** del calendario (el challenge pide descargar visualizaciones). [inferencia]
- Mostrar **celda-días** como métrica principal y el **conteo crudo de focos** como secundario, con una línea que explique la diferencia.

# Color y accesibilidad
- Calendario: rampa secuencial de un tono (7 pasos); anomalía: divergente (9 pasos). Ambas en claro y oscuro (variables CSS del v5).
- Niveles de alerta del globo: verde → amarillo → naranja → rojo → violeta. Verde y rojo juntos no se distinguen con daltonismo rojo-verde: acompañar siempre con etiqueta o forma, o pasar a una rampa secuencial. [inferencia]
- Todo dato en color también como texto (tooltip o tabla). Foco visible y navegación por teclado.

# Idioma
- **La interfaz va en inglés.** Ambos prototipos están en castellano; la app se enlaza en la entrega y todo lo enlazado tiene que estar en inglés. [inferencia]
- Formato de números y fechas en inglés (`en-US`) en la versión de entrega.

# Datos simulados
- El globo inventa cuarteles de bomberos ("Cuartel de Bomberos N° k"), reportes y resultados ("Incendio evitado", "Foco contenido a tiempo"), y una semana "actual" generada desde un año análogo. [hecho]
- Regla: **nada simulado sin una etiqueta visible de "Simulated"**, y nada simulado en la demo presentado como real. Un jurado que lo tome por real le pega a Validity. [inferencia]
- Para la entrega: sacar la vista de planificación o dejarla como concepto, claramente marcada.

# Marca
- Nombre: **Firespire**. El ícono actual es una llama propia en SVG.
- Sin logos ni elementos de marca de NASA. [hecho]
