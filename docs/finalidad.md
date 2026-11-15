---
type: Concept
title: "Firespire — finalidad y alcance"
description: "Qué problema resuelve Firespire, para quién, qué pide el challenge de NASA, alcance adentro/afuera y relación con los criterios del jurado."
tags: ["firespire", "nasa-space-apps-2026", "modis-viirs"]
sources:
  - "https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/?tab=details"
  - "https://www.spaceappschallenge.org/resources/judging-awards-guide/"
  - "https://www.spaceappschallenge.org/resources/project-submission-guide/"
origin_default: relato
privacy: open
status: draft
generated:
  by: "andy/claude-code"
  at: "2026-11-14T21:05:00-03:00"
---
# Resumen
- **Firespire** es una web app que convierte más de 25 años de focos de calor satelitales en **una sola historia consistente del fuego** para Argentina, sin que importe qué satélite los detectó.
- Pregunta guía: **"¿este fuego es normal para esta zona y esta época?"**
- Responde al challenge oficial *MODIS and VIIRS Hot Spots* del NASA Space Apps Challenge 2026 (Buenos Aires, 14–15 de noviembre). [hecho]

# Problema
- MODIS (Terra y Aqua) observa desde 2000 y está terminando su vida útil; VIIRS (S-NPP, NOAA-20, NOAA-21) observa desde 2012 con más detalle. Difieren en resolución, sensibilidad y horarios, así que sus registros no se comparan directamente. [hecho]
- Además, VIIRS cambió de 1 a 2 y a 3 satélites, y desde el 2/11/2026 vuelve a 2 (S-NPP dejó de entregar). Más pasadas por día significan más detecciones aunque no haya más fuego. [inferencia]
- Resultado: quien gestiona el fuego no tiene una imagen consistente de cuándo y dónde se quemó.

# Para quién
| Usuario | Qué necesita |
|---|---|
| Gestores de emergencia y alerta temprana | Saber si la actividad actual es anómala y dónde mirar primero |
| Brigadistas y bomberos | Ubicar focos activos y su historia en la zona |
| Gestores de tierras | Estacionalidad y tendencias por región |
| Científicos | Serie armonizada descargable y un método explícito y validado |

# Qué pide NASA
| Requisito | Nivel |
|---|---|
| Armonizar MODIS y VIIRS para que el sensor de origen deje de importar | Núcleo |
| Web app con selección de región y rango de fechas | Núcleo |
| Calendario de actividad de fuego desde principios de los 2000 | Núcleo |
| Comparar el mes actual contra la mediana histórica | Recomendado |
| Rampas de color accesibles | Recomendado |
| CSV de los focos de una búsqueda y descarga de analíticas y visualizaciones | Recomendado |
| Mapa para dibujar el área o ingresar lat/lon | Opcional |
| Anomalías contra promedios multianuales | Opcional |

# Alcance
**Adentro**
- Argentina, de noviembre de 2000 a hoy.
- Serie armonizada en celda-días H3 con factores de calibración y error de validación publicados.
- Calendario mes × año, filtros por región y fechas, descargas.
- Museo de 3 a 5 grandes incendios históricos.
- Anomalía del período actual contra la línea base.

**Afuera (por ahora)**
- Cobertura global.
- Estimar "incendios que faltaron" en los datos.
- Pronóstico de riesgo.
- Login, cuentas y base de datos.
- Integración real con cuarteles de bomberos: el prototipo la simula (ver [Diseño](diseno.md)).

# Encuadre del pitch
- El pitch se dirige a NASA y no menciona otras instituciones. Esto no aplica al campo de datos y recursos de la entrega, donde se lista todo lo usado. [inferencia]
- Ganchos: (a) el mismo incendio visto por MODIS con X focos y por VIIRS con 2X, reconciliado por la armonización; (b) "el satélite que murió hace 12 días", solo si la caída de S-NPP se ve en los datos.

# Criterios del jurado
Los cinco pesan lo mismo. [hecho]

| Criterio | Cómo responde Firespire |
|---|---|
| Influence | Pregunta operativa para quien gestiona el fuego; extensible a otras regiones |
| Creativity | Corrección explícita por régimen de constelación; museo de incendios |
| Validity | Validación con datos retenidos y caída simulada de S-NPP, con un número publicado |
| Relevance | Cubre los requisitos núcleo y recomendados del enunciado |
| Presentation | Demo corta (video ≤ 30 s o ≤ 7 slides) contada desde un incendio real |

# Restricciones de la entrega
- Todo lo que se presenta va en inglés: página de entrega, materiales enlazados y la app. [inferencia sobre la app]
- Se declaran todos los datos, código y herramientas usados, y el uso de IA. [hecho]
- Sin logos ni elementos de marca de NASA en contenido generado; imágenes o video generados con IA llevan marca de agua visible. [hecho]
- Cierre: domingo 15/11, 23:59 hora local. [hecho]
