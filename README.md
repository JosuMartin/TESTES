<<<<<<< HEAD
# TESTES

Aplicación web local que convierte un PDF en un test interactivo de 20 preguntas mediante la API de Gemini.

La interfaz utiliza un tema oscuro de alto contraste. Los tests tienen dificultad media-alta: los distractores se construyen a partir de conceptos próximos y matices del documento, manteniendo siempre una única respuesta correcta.

## Preparación

1. Instala [Node.js 20 o posterior](https://nodejs.org/).
2. Duplica `.env.example` y llama a la copia `.env`.
3. Añade tu clave de Google AI Studio en `GEMINI_API_KEY`.
4. Abre una terminal en esta carpeta y ejecuta:

   ```powershell
   npm install
   npm start
   ```

5. Abre <http://localhost:3000> en el navegador.

## Configuración

```env
GEMINI_API_KEY=tu_clave
GEMINI_MODEL=gemini-3.5-flash-lite
PORT=3000
```

La clave permanece en el servidor local y no se envía al navegador. Los PDF admitidos pueden ocupar hasta 40 MB. El contenido se envía a Gemini para crear las preguntas, pero la aplicación no guarda el archivo en disco.

## Uso

Selecciona o arrastra un PDF, pulsa **Crear test de 20 preguntas** y responde una pregunta cada vez. Tras cada respuesta se muestra una explicación y su referencia dentro del documento.

La aplicación recuerda localmente en el navegador hasta 80 enunciados recientes por PDF. Al generar otro test del mismo archivo, el modelo utiliza ese historial para volver a evaluar los conceptos importantes desde perspectivas diferentes: definición, comparación, aplicación, consecuencias, requisitos, excepciones o casos prácticos. El historial no excluye temas esenciales; sirve para evitar que se repita la misma formulación o el mismo razonamiento. Solo se guardan los enunciados; el PDF no se almacena.

Los tests priorizan los objetivos de aprendizaje esenciales del documento y mantienen una dificultad media. El servidor revisa automáticamente la calidad de las opciones, corrige tests donde la respuesta correcta destaque por longitud y reparte exactamente cinco respuestas correctas en cada posición (A, B, C y D).

## Historial y progreso

Cada test generado se guarda localmente en el navegador junto con sus respuestas y la última pregunta visitada. Desde la pantalla principal se puede continuar un test incompleto o repetir uno terminado. Se conservan los 20 intentos más recientes; el historial puede borrarse completo o por elementos.
=======
# 📚 TESTES

### Generador de tests interactivos a partir de documentos PDF mediante Inteligencia Artificial

**TESTES** es una aplicación web que permite transformar documentos PDF en cuestionarios interactivos de forma automática utilizando un modelo de Inteligencia Artificial.

El objetivo es facilitar el estudio y la preparación de exámenes, convirtiendo cualquier documento de aprendizaje en un test de **20 preguntas generado a partir de su contenido**.

## 🚀 Funcionalidades

- 📄 **Carga de documentos PDF:** permite subir archivos PDF para utilizarlos como material de estudio.
- 🤖 **Generación mediante IA:** utiliza un modelo de Inteligencia Artificial integrado en la aplicación para analizar el contenido del documento y generar preguntas.
- 📝 **20 preguntas automáticas:** crea un cuestionario de 20 preguntas relacionadas con la información del PDF.
- 🎯 **Test interactivo:** permite responder las preguntas directamente desde la aplicación.
- 📚 **Aprendizaje personalizado:** cada cuestionario se genera a partir del documento proporcionado por el usuario.
- ⚡ **Proceso automatizado:** transforma documentos de estudio en ejercicios prácticos sin necesidad de redactar manualmente las preguntas.

## 🧠 ¿Cómo funciona?

**1. Subir un PDF**

El usuario selecciona un documento PDF con el contenido que desea estudiar.

**2. Procesamiento con IA**

La aplicación procesa el documento y utiliza un modelo de Inteligencia Artificial para interpretar su contenido.

**3. Generación del cuestionario**

El sistema genera automáticamente un test de 20 preguntas basadas en la información extraída.

**4. Realización del test**

El usuario puede interactuar con las preguntas y poner a prueba sus conocimientos.

## 🎯 Objetivo del proyecto

Este proyecto nace con la idea de aprovechar el potencial de la Inteligencia Artificial aplicada a la educación.

Busca ofrecer una herramienta sencilla y práctica para estudiantes, opositores y cualquier persona que necesite repasar información de documentos extensos.

En lugar de limitarse a leer y memorizar contenidos, el usuario puede practicar mediante cuestionarios generados específicamente para su material de estudio.

## 💡 Aplicaciones

- Preparación de oposiciones.
- Estudio de asignaturas académicas.
- Repaso de apuntes y temarios.
- Autoevaluación de conocimientos.
- Formación y aprendizaje autónomo.

## 🔮 Futuras mejoras

- Generación de cuestionarios con diferentes niveles de dificultad.
- Personalización del número de preguntas.
- Historial de cuestionarios realizados.
- Estadísticas de rendimiento y progreso.
- Explicaciones de las respuestas mediante IA.
- Compatibilidad con otros formatos de documentos.

## 👨‍💻 Desarrollador

**Josu Martín** — Desarrollador Full Stack

Proyecto personal enfocado en la integración de Inteligencia Artificial en aplicaciones web y en el desarrollo de herramientas digitales orientadas al aprendizaje.

🔗 [LinkedIn](https://www.linkedin.com/in/josumartin/)

---

⭐ Si te resulta interesante este proyecto, ¡puedes dejar una estrella en el repositorio!
>>>>>>> 6cf6b05 (Subir proyecto)
