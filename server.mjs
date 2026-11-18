import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt, randomUUID } from 'node:crypto';

import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const apiKey = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
const fallbackModel = 'gemini-3.1-flash-lite';
const maxPdfBytes = 40 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: maxPdfBytes, fields: 2, fieldSize: 50 * 1024 },
});

const variationProfiles = [
  'Prioriza conceptos esenciales, diferencias claras y consecuencias directas.',
  'Incluye algunos supuestos prácticos sencillos y preguntas de aplicación, además de conceptos esenciales.',
  'Recorre el tema de principio a fin y presta atención a requisitos y límites importantes, sin centrarse en excepciones marginales.',
  'Combina definiciones, clasificación, funcionamiento y situaciones concretas fáciles de interpretar.',
  'Refuerza los apartados importantes menos recordados sin abandonar las ideas fundamentales ni recurrir a detalles mínimos.',
];

function parsePreviousQuestions(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.length === 0) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((question) => typeof question === 'string')
      .map((question) => question.trim().slice(0, 300))
      .filter(Boolean)
      .slice(-80);
  } catch {
    return [];
  }
}

const quizSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    questions: {
      type: 'array',
      minItems: 20,
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string' },
          options: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: { type: 'string' },
          },
          correctIndex: { type: 'integer', minimum: 0, maximum: 3 },
          explanation: { type: 'string' },
          sourceReference: { type: 'string' },
        },
        required: ['question', 'options', 'correctIndex', 'explanation', 'sourceReference'],
      },
    },
  },
  required: ['title', 'questions'],
};

function getGeminiErrorDetails(error) {
  const errorText = error instanceof Error ? error.message : String(error);
  const explicitStatus = [error?.status, error?.statusCode, error?.code, error?.response?.status]
    .find((value) => Number.isInteger(value) && value >= 400 && value < 600);
  const inferredStatus = /429|RESOURCE_EXHAUSTED/i.test(errorText)
    ? 429
    : /401|403|API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED/i.test(errorText)
      ? 401
      : /404|NOT_FOUND/i.test(errorText)
        ? 404
        : /503|UNAVAILABLE/i.test(errorText)
          ? 503
          : /500|INTERNAL|fetch failed|timeout|timed out/i.test(errorText)
            ? 500
            : null;

  return { status: explicitStatus ?? inferredStatus ?? 500, errorText };
}

function canRetrySameModel(error) {
  const { status, errorText } = getGeminiErrorDetails(error);
  return status === 500 || status === 503 || /fetch failed|timeout|timed out/i.test(errorText);
}

function canTryFallbackModel(error) {
  const { status, errorText } = getGeminiErrorDetails(error);
  return [404, 429, 500, 503].includes(status) || /fetch failed|timeout|timed out/i.test(errorText);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function generateStructuredQuiz(client, contents) {
  const generationModels = [...new Set([model, fallbackModel])];
  let aiResponse;
  let lastGenerationError;

  for (const candidateModel of generationModels) {
    const attempts = candidateModel === model ? 2 : 1;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        aiResponse = await client.models.generateContent({
          model: candidateModel,
          contents,
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: quizSchema,
            maxOutputTokens: 10000,
            temperature: 0.9,
          },
        });
        break;
      } catch (error) {
        lastGenerationError = error;
        const hasAnotherAttempt = attempt < attempts && canRetrySameModel(error);

        if (!hasAnotherAttempt) break;
        console.warn(`Gemini ${candidateModel} no respondió. Reintentando (${attempt + 1}/${attempts})...`);
        await wait(1500 * attempt);
      }
    }

    if (aiResponse) break;
    if (!canTryFallbackModel(lastGenerationError)) break;
    console.warn(`Cambiando temporalmente al modelo de reserva ${fallbackModel}.`);
  }

  if (!aiResponse) throw lastGenerationError;
  if (!aiResponse.text) throw new Error('El modelo no devolvió contenido utilizable.');

  return JSON.parse(aiResponse.text);
}

function getOptionWordCount(option) {
  return option.trim().split(/\s+/u).filter(Boolean).length;
}

function getQuizQualityIssues(quiz) {
  if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length !== 20) {
    return ['El test no contiene exactamente 20 preguntas.'];
  }

  const duplicateOptionQuestions = [];
  const lengthBiasedQuestions = [];
  const unevenOptionQuestions = [];
  const genericOptionQuestions = [];
  const genericPattern = /\b(?:todas las anteriores|ninguna de las anteriores|todas son correctas|ninguna es correcta|no se puede determinar)\b/iu;

  quiz.questions.forEach((question, index) => {
    if (!Array.isArray(question.options) || question.options.length !== 4) return;

    const normalizedOptions = question.options.map((option) => option.trim().toLocaleLowerCase('es'));
    if (new Set(normalizedOptions).size !== 4) duplicateOptionQuestions.push(index + 1);
    if (question.options.some((option) => genericPattern.test(option))) genericOptionQuestions.push(index + 1);

    const lengths = question.options.map(getOptionWordCount);
    const correctLength = lengths[question.correctIndex];
    const wrongLengths = lengths.filter((_length, optionIndex) => optionIndex !== question.correctIndex);
    const longestWrong = Math.max(...wrongLengths);
    const shortest = Math.min(...lengths);
    const longest = Math.max(...lengths);

    if (correctLength >= longestWrong + 3 && correctLength > longestWrong * 1.25) {
      lengthBiasedQuestions.push(index + 1);
    }
    if (longest >= shortest * 2.2 && longest - shortest >= 5) {
      unevenOptionQuestions.push(index + 1);
    }
  });

  const issues = [];
  if (duplicateOptionQuestions.length > 0) {
    issues.push(`Hay opciones duplicadas en las preguntas ${duplicateOptionQuestions.join(', ')}.`);
  }
  if (genericOptionQuestions.length > 0) {
    issues.push(`Hay opciones genéricas en las preguntas ${genericOptionQuestions.join(', ')}.`);
  }
  if (lengthBiasedQuestions.length > 2) {
    issues.push(`La respuesta correcta destaca por longitud en las preguntas ${lengthBiasedQuestions.join(', ')}.`);
  }
  if (unevenOptionQuestions.length > 3) {
    issues.push(`Las opciones tienen longitudes demasiado desiguales en las preguntas ${unevenOptionQuestions.join(', ')}.`);
  }

  return issues;
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function balanceCorrectAnswerPositions(quiz) {
  const targetPositions = shuffled([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3]);

  return {
    ...quiz,
    questions: quiz.questions.map((question, questionIndex) => {
      const correctOption = question.options[question.correctIndex];
      const distractors = shuffled(
        question.options.filter((_option, optionIndex) => optionIndex !== question.correctIndex),
      );
      const targetPosition = targetPositions[questionIndex];
      distractors.splice(targetPosition, 0, correctOption);

      return {
        ...question,
        options: distractors,
        correctIndex: targetPosition,
      };
    }),
  };
}

app.disable('x-powered-by');
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json({ configured: Boolean(apiKey), provider: 'Gemini', model });
});

app.post('/api/generate-test', upload.single('pdf'), async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');

  if (!apiKey) {
    return response.status(503).json({
      error: 'Falta GEMINI_API_KEY. Añádela al archivo .env y reinicia el servidor.',
    });
  }

  if (!request.file) {
    return response.status(400).json({ error: 'Selecciona un archivo PDF.' });
  }

  const hasPdfExtension = request.file.originalname.toLowerCase().endsWith('.pdf');
  const hasPdfSignature = request.file.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (request.file.mimetype !== 'application/pdf' || !hasPdfExtension || !hasPdfSignature) {
    return response.status(415).json({ error: 'El archivo seleccionado no parece ser un PDF válido.' });
  }

  try {
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 120000 },
    });
    const base64Pdf = request.file.buffer.toString('base64');
    const previousQuestions = parsePreviousQuestions(request.body.previousQuestions);
    const variationId = randomUUID();
    const variationProfile = variationProfiles[randomInt(variationProfiles.length)];
    const historyContext = previousQuestions.length > 0
      ? `Estas son preguntas utilizadas recientemente con este mismo PDF:\n${previousQuestions.map((question, index) => `${index + 1}. ${question}`).join('\n')}\nNo consideres prohibidos sus temas. Utiliza este historial para volver a evaluar los conceptos importantes desde otro ángulo cognitivo: definición, reconocimiento, comparación, relación causa-efecto, aplicación, caso práctico, consecuencia, requisito o excepción. Evita limitarte a cambiar unas palabras manteniendo idéntica la pregunta.`
      : 'Es la primera sesión registrada para este PDF: crea una selección variada que se centre en sus conceptos más importantes.';
    const prompt = [
      'Crea un test de dificultad media de estudio en español basándote EXCLUSIVAMENTE en el PDF adjunto.',
      'Genera exactamente 20 preguntas tipo test, con cuatro opciones cada una y una sola respuesta correcta.',
      'Antes de redactar, identifica internamente entre 8 y 12 objetivos de aprendizaje esenciales del documento, ordénalos por importancia y usa esa jerarquía para repartir las preguntas. No muestres esa planificación.',
      'Dedica aproximadamente el 75 % de las preguntas a las ideas nucleares que una persona debe dominar, el 15 % a relaciones, requisitos o límites relevantes, y como máximo el 10 % a detalles secundarios realmente examinables.',
      'Evita convertir el test en una colección de detalles aislados. Debe ayudar a comprender y retener correctamente los puntos importantes de todo el tema.',
      'Mantén una dificultad media: pueden existir hasta 5 preguntas de recuerdo directo; al menos 6 deben plantear comprensión, consecuencia o un supuesto práctico sencillo, y al menos 4 deben exigir comparar conceptos, detectar una condición o relacionar dos ideas.',
      'La mayoría de preguntas debe poder resolverse dominando correctamente una idea principal del tema. No obligues a combinar más de dos conceptos ni conviertas pequeñas diferencias de redacción en trampas.',
      'Utiliza excepciones o límites solo cuando sean relevantes y estén claramente explicados en el documento; no preguntes por matices mínimos, datos marginales o formulaciones deliberadamente engañosas.',
      'Construye cada distractor a partir del mismo apartado y de la misma categoría conceptual que la respuesta correcta. Debe ser razonable, pero la opción correcta tiene que resultar clara para quien haya estudiado y comprendido el tema.',
      'Para crear distractores usa conceptos próximos del documento, requisitos parcialmente correctos, sujetos u órganos cercanos, pasos en orden incorrecto o consecuencias intercambiadas. Evita que tres opciones sean casi idénticas y solo cambien una palabra insignificante.',
      'Las cuatro opciones de cada pregunta deben tener un nivel de detalle, precisión, estructura gramatical y longitud muy similares. Como regla general, la diferencia entre la opción más corta y la más larga no debe superar unas pocas palabras.',
      'La respuesta correcta no puede ser identificable por su forma: no debe ser sistemáticamente la más larga, la única concreta, la única técnica, la única prudente o la única formulada en positivo. En cada pregunta debe haber al menos un distractor de longitud igual o superior a la correcta.',
      'No uses “todas las anteriores”, “ninguna de las anteriores”, opciones humorísticas, afirmaciones absurdas, respuestas de otra categoría ni distractores que puedan descartarse sin conocer el tema.',
      'Debe existir una sola respuesta inequívocamente correcta según el PDF. La dificultad debe proceder de distinguir matices reales, nunca de ambigüedades, dobles negaciones o preguntas capciosas.',
      'No inventes datos ni uses conocimientos externos. Evita preguntas capciosas o ambiguas.',
      'Combina recuerdo, comprensión y aplicación. La variedad debe proceder del enfoque y del razonamiento exigido, no de omitir los contenidos importantes.',
      'Antes de entregar el JSON, revisa una por una las 20 preguntas: confirma que los cuatro enunciados podrían parecer plausibles, que solo uno es correcto y que la longitud no revela la solución.',
      `Perfil distinto para esta sesión: ${variationProfile}`,
      `Identificador aleatorio de esta sesión: ${variationId}. Úsalo solamente para variar la selección de contenidos y no lo menciones en el test.`,
      historyContext,
      'Incluye una explicación breve de la respuesta y una referencia a la página, apartado o epígrafe del PDF cuando pueda identificarse.',
      'Si no puede identificarse una referencia concreta, usa: “Contenido del documento”.',
    ].join(' ');

    const requestContents = [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Pdf,
            },
          },
          { text: prompt },
        ],
      },
    ];
    let quiz = await generateStructuredQuiz(client, requestContents);
    const qualityIssues = getQuizQualityIssues(quiz);

    if (qualityIssues.length > 0) {
      const revisionPrompt = [
        'Revisa y reescribe el borrador de test adjunto manteniendo exactamente 20 preguntas y basándote exclusivamente en el PDF.',
        'La revisión automática ha detectado estos problemas:',
        qualityIssues.join(' '),
        'Corrige esos problemas manteniendo una dificultad media y una respuesta claramente identificable para quien haya estudiado el tema.',
        'Conserva la cobertura de los contenidos esenciales y combina recuerdo, comprensión, comparaciones y casos prácticos sencillos, sin recurrir a matices mínimos ni excepciones marginales.',
        'Reescribe los distractores para que pertenezcan al mismo concepto que la respuesta correcta, sean plausibles y fallen únicamente por un matiz preciso.',
        'Iguala la longitud y el grado de detalle de las cuatro opciones. La respuesta correcta no debe destacar por ser la más larga; incluye al menos un distractor igual o más largo.',
        'No uses todas/ninguna de las anteriores, opciones absurdas ni información ajena al PDF.',
        `Borrador que debes mejorar: ${JSON.stringify(quiz)}`,
      ].join(' ');

      try {
        quiz = await generateStructuredQuiz(client, [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: base64Pdf,
                },
              },
              { text: revisionPrompt },
            ],
          },
        ]);
      } catch (revisionError) {
        console.warn('No se pudo completar la revisión adicional; se utilizará el primer test generado.', revisionError);
      }
    }

    return response.json(balanceCorrectAnswerPositions(quiz));
  } catch (error) {
    console.error('No se pudo generar el test:', error);

    const { status } = getGeminiErrorDetails(error);
    const message = status === 401
      ? 'La clave de Gemini no es válida o no tiene acceso. Revisa GEMINI_API_KEY en el archivo .env.'
      : status === 429
        ? 'Se ha alcanzado la cuota gratuita de Gemini. Espera a que se reinicie o consulta los límites en Google AI Studio.'
        : status === 404
          ? `El modelo ${model} no está disponible para este proyecto. Revisa GEMINI_MODEL en el archivo .env.`
          : status === 503
            ? 'Gemini está temporalmente saturado. Espera unos minutos y vuelve a intentarlo.'
            : 'No se ha podido generar el test con Gemini. Comprueba la conexión y vuelve a intentarlo.';

    return response.status(status).json({ error: message });
  }
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return response.status(413).json({ error: 'El PDF supera el límite de 40 MB.' });
  }

  console.error('Error inesperado:', error);
  return response.status(500).json({ error: 'Ha ocurrido un error inesperado.' });
});

app.listen(port, () => {
  console.log(`TESTES disponible en http://localhost:${port}`);
});
