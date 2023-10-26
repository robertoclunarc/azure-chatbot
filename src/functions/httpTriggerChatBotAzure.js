const { app } = require('@azure/functions');
const axios = require('axios');

app.http('httpTriggerChatBotAzure', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`La función HTTP procesó la solicitud de URL "${request.url}"`);
        
        if (request.method === 'GET') {
            return handleGetRequest(request, context);
        } else {
            return handlePostRequest(request, context);
        }
    }
});

async function handleGetRequest(request, context) {
    const rVerifyToken = request.query.get('hub.verify_token');
    if (rVerifyToken === process.env.VerifyToken) {
        const challenge = request.query.get('hub.challenge');
        context.res = {
            body: parseInt(challenge),
            statusCode: 200,
        };
    } else {
        context.res = {
            body: 'Error, wrong validation token',
            status: 422,
        };
    }

    return context.res;
}

async function handlePostRequest(request, context) {
    try {
        const req = await request.text();
        const data = JSON.parse(req);

        const message = data.entry[0].messaging[0].message.text;
        const idRecipient = data.entry[0].messaging[0].recipient.id;
        context.log(`datos entrada query: ${JSON.stringify(data)}`);
        
        const sender = data.object;
        const tiempo = new Date(); //new Date(data.entry[0].time)
        const dateTime = await fotmatedDateTime(tiempo);
        context.log(sender);
        context.log(dateTime);

        const reqUser = {
            role: "user",
            content: message,
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
        context.conversation_history_dict.push(reqUser);

        const headers = {
            'Content-Type': 'application/json',
            'api-key': `${process.env.apiKeyAzureOpenAI}`,
        };

        const urlServiceOpenaIAAzure = process.env.urlServiceOpenAIAzure;

        const requestBody = JSON.stringify({
            "messages": context.conversation_history_dict,
            "max_tokens": 1000,
            "temperature": 0.5,
            "frequency_penalty": 0,
            "presence_penalty": 0,
            "top_p": 0.95,
            "stop": null,
        });

        const response = await axios.post(urlServiceOpenaIAAzure, requestBody, { headers });

        const OpenAiResponse = response.data;
        const reply = OpenAiResponse.choices[0].message.content;
        context.conversation_history_dict.push({
            role: "assistant",
            content: reply,
        });                
        context.log(JSON.stringify(context.conversation_history_dict));
        if (sender==='instagram'){
            context.log('Intentando enviar a instagram...');
            const responseData = await sendMessageToMessenger(context, idRecipient, reply);
            context.log(responseData);
        }

        context.res = {
            body: reply,
        };

        return context.res;
    } catch (error) {
        context.error(`Error en el servicio:  ${error}`);
        context.error(`Detalle Error:  ${error.message}`);
        context.res = {
            status: 500,
            body: 'Error en el servicio: ' + error.message,
        };
    }
}

async function sendMessageToMessenger(context, idRecipient, message) {
    const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
    const LATEST_API_VERSION = "v18.0";
    const URLInstagram = `https://graph.facebook.com/${LATEST_API_VERSION}/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    //const URLInstagram = `https://graph.facebook.com/${LATEST_API_VERSION}/${PAGE_ID}/messages?recipient={'id':'${idRecipient}'}&messaging_type=RESPONSE&message={'text':'${reply}'}&access_token=${PAGE_ACCESS_TOKEN}`;
    const messageData = {
        recipient: { id: idRecipient },
        message: { text: message },
    };
    context.log(messageData);
    context.log(URLInstagram);
    try {
        const responseData = await axios.post(URLInstagram, messageData, {'Content-Type': 'application/json'});
        return responseData;
    } catch (error) {
        context.error(`Error al enviar mensaje a Messenger: ${error.message}`);
        return null;
    }
}

async function fotmatedDateTime(timeInMilliseconds) {
    const formattedDate = timeInMilliseconds;

    const day = formattedDate.getDate().toString().padStart(2, '0');
    const month = (formattedDate.getMonth() + 1).toString().padStart(2, '0');
    const year = formattedDate.getFullYear();
    const hours = formattedDate.getHours().toString().padStart(2, '0');
    const minutes = formattedDate.getMinutes().toString().padStart(2, '0');

    const formattedTime = `${year}-${month}-${day} ${hours}:${minutes}:00`;
    
    return formattedTime;
}
