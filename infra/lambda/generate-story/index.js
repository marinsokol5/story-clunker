const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

// Cache secrets client and secrets
let secretsCache = null;

const getSecrets = async () => {
  if (secretsCache) return secretsCache;
  
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: process.env.SECRETS_ARN })
  );
  
  secretsCache = JSON.parse(response.SecretString);
  return secretsCache;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

exports.handler = async (event) => {
  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    const requestBody = JSON.parse(event.body || '{}');
    const { previousSegments, genre } = requestBody;

    if (!previousSegments || !genre) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'previousSegments and genre are required' }),
      };
    }

    console.log('Generating story continuation for genre:', genre);

    // Craft a system prompt based on genre
    const genrePrompts = {
      scary: "You are a master horror writer. Create suspenseful, eerie, and thrilling story continuations that keep readers on edge. Use vivid, atmospheric descriptions and build tension.",
      funny: "You are a comedic storyteller. Create humorous, witty, and entertaining story continuations with clever wordplay, unexpected twists, and laugh-out-loud moments.",
      'sci-fi': "You are a science fiction author. Create imaginative, thought-provoking story continuations with advanced technology, alien worlds, and futuristic concepts."
    };

    const systemPrompt = genrePrompts[genre] || genrePrompts['sci-fi'];
    
    // Build context from previous segments
    const storyContext = previousSegments.map((seg, idx) => 
      `${seg.is_ai_generated ? '[AI]' : '[User]'}: ${seg.content}`
    ).join('\n\n');

    const userPrompt = `Continue this ${genre} story with 2-3 engaging paragraphs that naturally flow from what came before. Make it creative and compelling:\n\n${storyContext}\n\nYour continuation:`;

    // Use Amazon Bedrock with Claude Haiku 4.5
    const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
    const modelId = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
    
    const prompt = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4096,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${systemPrompt}\n\n${userPrompt}`
            }
          ]
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(prompt),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const generatedText = responseBody.content[0].text;

    console.log('Story continuation generated successfully');

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ continuation: generatedText }),
    };
  } catch (error) {
    console.error('Error in generate-story function:', error);
    
    // Handle specific error cases
    if (error.name === 'ThrottlingException' || error.name === 'ServiceQuotaExceededException') {
      return {
        statusCode: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
      };
    }
    
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'An error occurred' }),
    };
  }
};

