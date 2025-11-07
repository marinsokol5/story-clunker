const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const { createClient } = require("@supabase/supabase-js");

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
    const { segmentId } = requestBody;
    
    if (!segmentId) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Segment ID is required' }),
      };
    }

    const secrets = await getSecrets();
    
    if (!secrets.SUPABASE_URL || !secrets.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }

    // Create Supabase client
    const supabase = createClient(secrets.SUPABASE_URL, secrets.SUPABASE_SERVICE_ROLE_KEY);

    // Fetch the segment from the database
    const { data: segment, error: fetchError } = await supabase
      .from('story_segments')
      .select('content, story_id, stories(genre)')
      .eq('id', segmentId)
      .single();

    if (fetchError || !segment) {
      console.error('Error fetching segment:', fetchError);
      return {
        statusCode: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Segment not found' }),
      };
    }

    const storyData = segment.stories;
    const genre = Array.isArray(storyData) ? storyData[0]?.genre : storyData?.genre;

    console.log('Analyzing segment for improvements, genre:', genre);

    const systemPrompt = `You are an expert creative writing coach. Analyze the provided story segment and suggest specific, actionable improvements. Focus on:
- Narrative flow and pacing
- Character development
- Descriptive language and imagery
- Dialogue quality (if present)
- Genre-specific elements
- Grammar and style

Provide 3-5 concrete suggestions that will enhance the writing quality.`;

    const userPrompt = `Genre: ${genre}\n\nStory segment to analyze:\n\n${segment.content}\n\nProvide specific improvement suggestions:`;

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
    const suggestions = responseBody.content[0].text;

    console.log('Improvement suggestions generated successfully');

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestions }),
    };
  } catch (error) {
    console.error('Error in suggest-improvements function:', error);
    
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

