---
type: Decision
title: "Firespire — registro de decisiones"
description: "Decisiones tomadas y abiertas de Firespire (producto, método, datos, arquitectura, diseño, entrega), con su origen y lo que bloquean."
tags: ["firespire", "nasa-space-apps-2026", "decisiones"]
sources:
  - "/inbox/resumen-contexto-modis-viirs-2026-11-14.md"
origin_default: relato
privacy: open
status: draft
generated:
  by: "andy/claude-code"
  at: "2026-11-14T21:05:00-03:00"
---
# Resumen
- Las **tomadas** vienen del resumen del 14/11 o del código del repo.
- Las **abiertas** necesitan decisión del equipo; la que más bloquea es D-01.
- El 15/11 Fernando confirmó que las decisiones de método abiertas (D-04, D-05, D-07, D-08, D-09) habían quedado obsoletas frente a la arquitectura implementada; pasaron a T-15 a T-19.

# Tomadas
| ID | Decisión | Origen |
|---|---|---|
| T-01 | Challenge *MODIS and VIIRS Hot Spots*; pitch dirigido a NASA, sin mencionar otras instituciones | Resumen 14/11 |
| T-02 | Nombre del proyecto: Firespire | Fernando, 14/11 |
| T-03 | Unidad de medida: celda-día por día UTC; conteo crudo como dato secundario | Resumen 14/11 |
| T-04 | Armonización a escala MODIS: MODIS hasta ene-2012; VIIRS × k por régimen después; k = Σ MODIS / Σ VIIRS en meses SP | Resumen 14/11 |
| T-05 | Validación: año SP retenido y caída simulada de S-NPP | Resumen 14/11 |
| T-06 | No se estiman "incendios que faltaron" | Resumen 14/11 |
| T-07 | Grilla H3 (reemplaza 0,5° del v5 y 0,1° del repo para el método) | Resumen 14/11 |
| T-08 | Stack: Python + DuckDB para el método; artefactos estáticos; Next.js en Vercel; sin base ni login | Resumen 14/11 |
| T-09 | Alcance geográfico: Argentina | Resumen 14/11 y código |
| T-10 | Fuente histórica: CSV anuales por país de FIRMS | Código (`fuentes/`) [inferencia] |
| T-11 | Meses NRT marcados como provisorios y fuera de la calibración | Resumen 14/11 |
| T-12 | Hosting en **Vercel**: artefactos como archivos estáticos en `public/` (van por CDN) y funciones solo para lo que necesita servidor (`hotspots.csv`, y `series` si no se resuelve en el navegador). `FIRMS_MAP_KEY` como variable de entorno del servidor. GitHub Pages queda descartado como hosting principal porque no corre código de servidor | Fernando, 14/11 (confirma el resumen del 14/11) |
| T-13 | k por régimen **y por mes calendario** (`calibration.json::k_by_month`; si un mes tiene menos de 2 meses de calibración se usa el k del régimen). Cierra D-06 | Fernando, 15/11 |
| T-14 | Museo con **eventos reales curados** (fuentes buscadas con Tavily y revisadas por una persona) y **vínculo calculado** con las detecciones FIRMS (radio × fechas), presentado siempre como superposición y no como atribución. Cierra D-10 y reemplaza la regla del globo de exhibiciones ficticias (D-14) | Fernando, 15/11 |
| T-15 | Resolución H3 de calibración, máscara y publicación: **res 5**; res 6 no se usa (reemplaza D-04) | Implementado en `config.py` (`H3_RES`, `MASK_RES`); Fernando confirma el 15/11 |
| T-16 | Inicio del régimen V3 (NOAA-21): **2023-03-01**, fecha desde la que hay datos SP (reemplaza D-05) | Implementado en `config.py` (`REGIMES`); Fernando confirma el 15/11 |
| T-17 | Umbral de confidence de MODIS: 30, configurable y documentado como supuesto (reemplaza D-07) | Implementado en `config.py` (`MODIS_MIN_CONFIDENCE`) |
| T-18 | `type = 0` se filtra en MODIS y VIIRS cuando el campo existe; los CSV NRT no lo traen y ahí solo actúa la máscara de persistentes (reemplaza D-08) | Implementado en `filters.py`; `contratos.md` |
| T-19 | Escalón MODIS Terra-only (2000-11 a 2002-06): se declara como limitación, no se corrige (reemplaza D-09) | Declarado en doc 08; sin corrección en el código |

# Abiertas
| ID   | Pregunta                                                                                                        | Opciones                                                                                             | Recomendación de Andy                                                                                                                                                                                                                          | Bloquea                     |
| ---- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| D-01 | ¿Cuál es la columna vertebral del producto: el globo o el calendario armonizado?                                | (a) Globo + calendario + museo en un producto; (b) solo calendario; (c) solo globo                   | (a), con el calendario y el método como núcleo, porque es lo que pide el challenge [inferencia]                                                                                                                                                | Diseño, reparto del trabajo |
| D-02 | ¿Qué pasa con la vista de planificación (cuarteles y reportes simulados)?                                       | Sacar / dejar como concepto marcado / mantener                                                       | Sacarla de la entrega o marcarla como concepto [inferencia]                                                                                                                                                                                    | Demo                        |
| D-03 | Framework web: ¿portar a Next.js o mantener `index.html` estático desplegado en Vercel (más funciones sueltas)? | Next.js / estático + funciones                                                                       | Si el tiempo aprieta, estático + 1–2 funciones (`hotspots.csv`); portar a Next.js solo si el compañero ya lo domina [hipótesis]. El hosting ya está decidido (T-12)                                                                            | Arquitectura                |
| D-11 | Formato de la demo                                                                                              | Video ≤ 30 s / ≤ 7 slides                                                                            | Decidir antes de producir                                                                                                                                                                                                                      | Entrega                     |
| D-12 | Límites provinciales: `provincias_ign.json` fuera del repo                                                      | LFS / descarga en build / versión simplificada versionada                                            | Versionar solo `data/provincias.js` y documentar de dónde sale                                                                                                                                                                                 | Reproducibilidad            |
| D-13 | Recursos de partners de la hackathon                                                                            | GoDaddy (dominio gratis), GitHub Copilot, Planetary Computer, Google Cloud, Meteomatics, Miro, Azure | Dominio de GoDaddy apuntando a Vercel; Copilot si ya se usa (declarar en uso de IA); Planetary Computer solo para el museo si sobra tiempo; el resto afuera. Todo lo usado se lista en el campo de datos y recursos de la entrega [inferencia] | Entrega                     |
