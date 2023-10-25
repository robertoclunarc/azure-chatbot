const { app } = require('@azure/functions');
const axios = require('axios'); // Importa la biblioteca axios

app.http('httpTriggerChatBotAzure', {
    methods: ['GET', 'POST' ],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`La función HTTP procesó la solicitud de URL "${request.url}"`);
        if (request.method === 'GET') {
            const rVerifyToken = request.query.get('hub.verify_token');
            //context.log(rVerifyToken);
            if (rVerifyToken === 'my_awesome_token') {
                const challenge = request.query.get('hub.challenge');
                //context.log(challenge);
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
                const req = await request.text();
                const data =  JSON.parse(req);
                
                //context.log(`datos entrada query: ${JSON.stringify(data)}`);
                const message = await data.value.message.text;
                const idRecipient = await data.value.recipient.id;
                context.log(`mensaje: ${message} IDRECIPIENT: ${idRecipient}`);
                
                const reqUser = {
                    role: "user",
                    content: await message,
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
                const reply = OpenAiResponse.choices[0].message.content; 
                ///////enviar a messenger//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                const LATEST_API_VERSION = "v18.0";
                const PAGE_ID = "909870002389450";
                const PAGE_ACCESS_TOKEN = "EAANHtrxRsNYBO0vffe6KwCsjptdMzKaG3TexV5zwAKwkU7l1n11UikoTMfWqKgbYcc3m5FgZCffAuBIkiUTjbzjk9cTH1RGAVtoSLGtY1F8wi0m8vWaBVhDTZBvkZB6lPAOmkUygJfYOei6VV8QiEYTdpTby2HeRj5ynHebSwNoNVrfA65ZB1vbscAKP0Un8lVb6Sn2smderxAzq9gZDZD";
                
                const URLInstagram = `https://graph.facebook.com/${LATEST_API_VERSION}/${PAGE_ID}/messages?recipient={'id':'${idRecipient}'}&messaging_type=RESPONSE&message={'text':'${reply}'}&access_token=${PAGE_ACCESS_TOKEN}`;
                
                context.log(URLInstagram);
                
                const responseData = await axios.post(URLInstagram);
                context.log(`responseDAta: ${responseData.data}`);
                ///////////////////////////////////////////////////////////////////////////////////////////////////////////
                context.res = {
                    body: responseData.data
                };
                return context.res;
            } catch (error) {
                context.log(`Error en el servicio:  ${error}`);
                context.res = {
                    status: 500,
                    body: 'Error en el servicio: ' + error.message,
                };
            }
        }    
    }
});
