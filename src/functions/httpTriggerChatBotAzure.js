const { app } = require('@azure/functions');
const axios = require('axios'); // Importa la biblioteca axios

app.http('httpTriggerChatBotAzure', {
    methods: ['GET', 'POST' ],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`La función HTTP procesó la solicitud de URL "${request.url}"`);
        if (request.method === 'GET') {
            const rVerifyToken = request.query.get('hub.verify_token');
            context.log(rVerifyToken);
            if (rVerifyToken === 'my_awesome_token') {
                const challenge = request.query.get('hub.challenge');
                context.log(challenge);
                context.res = {
                    body: parseInt(challenge),
                    statusCode: 200,
                };            
            }else{
                context.res = {
                body: 'Error, wrong validation token',
                status: 422
                };           
            }
            return context.res;
        }else{

            try {
                const reqUser = {
                    role: "user",
                    content: await request.text(),
                };

                // Verifica si ya existe una conversación previa en el contexto
                if (!context.conversation_history_dict) {
                    context.conversation_history_dict = [];
                    const messages_init = {
                        role: "system",
                        content: "You are a technological equipment sales agent whose main objective is to help users select a device according to their needs and budget. You are friendly and concise. It only provides objective answers to queries and does not provide answers that are not related to technology equipment."
                    };
                    context.conversation_history_dict.push(messages_init);
                }

                const headers = {
                    'Content-Type': 'application/json',
                    'api-key': "cd89e5a7d91f4568abc9f135ae38016b"
                };

                context.conversation_history_dict.push(reqUser);

                const url = 'https://openiabotventas.openai.azure.com/openai/deployments/deploy-live-model/chat/completions?api-version=2023-07-01-preview';

                const requestBody = JSON.stringify({
                    "messages": context.conversation_history_dict,
                    "max_tokens": 1000,
                    "temperature": 0.5,
                    "frequency_penalty": 0,
                    "presence_penalty": 0,
                    "top_p": 0.95,
                    "stop": null
                });

                const response = await axios.post(url, requestBody, {headers});

                const OpenAiResponse = response.data;
                context.conversation_history_dict.push({
                    role: "assistant",
                    content: OpenAiResponse.choices[0].message.content
                });
                //context.log(context.conversation_history_dict);
                context.res = {
                    body: OpenAiResponse.choices[0].message.content
                };
                return context.res;
            } catch (error) {
                context.res = {
                    status: 500,
                    body: 'Error al comunicarse con el servicio de OpenAI en Azure: ' + error.message,
                };
            }
        }    
    }
});
