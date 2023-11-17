const { app } = require('@azure/functions');
const axios = require('axios');

app.http('httpTriggerChatBotAzure', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        //context.log(`La función HTTP procesó la solicitud de URL "${request.url}"`);
        
        if (request.method === 'GET') {
            return handleGetRequest(request, context);
        } else {
            const quickReplyDetected = await validPostRequest(request, context);
            /*if (quickReplyDetected) {
                
                context.log("Quick reply detectado, realizar acción correspondiente...");
            } else {
                // Realiza otras acciones si no hay quick reply
            }*/
            return handlePostRequest(request, context);
        }
    }
});

async function validPostRequest(request, context) {
    try {
        const req = await request.text();
        context.log(`Datos del request: ${JSON.stringify(req)}`);
        if (!request.body || typeof request.body !== 'string') {
            context.log('La solicitud no contiene un cuerpo de texto válido.');
            return false;
        }

        const data = JSON.parse(request.body);
        context.log(`Datos de entrada query: ${JSON.stringify(data)}`);

        if (data?.message && data?.message?.quick_reply) {
            const payload = data.message.quick_reply.payload;
            if (payload === '1' || payload === '2') {
                context.log(`payload: ${payload}`);
                return true;
            }
        }
        return false;
    } catch (error) {
        context.error(`Error en el servicio: ${error}`);
        context.res = {
            status: 500,
            body: 'Error en el servicio: ' + error.message,
        };
        return false;
    }
}

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
        const object = data.object;
        
        var message;
        var idRecipient;
        if (object==='whatsapp'){
            message = data.content;
            idRecipient = data?.idRecipient;
        }
        else{
            idRecipient = data.entry[0].messaging[0].sender.id;
            message = data.entry[0].messaging[0].message.text;
        }

        //////valida que no se ejecute dos veces el bot
        if (idRecipient !== process.env.serderIdVentaIntagram){
            //context.log(`Datos de entrada query: ${JSON.stringify(data)}`);
            const tiempo = new Date(); //new Date(data.entry[0].time)
            const dateTime = await fotmatedDateTime(tiempo);
            const prompt = process.env.promptVentasInstagram;
           
            var reply = '';
            if (message!==undefined && message!==''){
                const reqUser = {
                    role: "user",
                    content: message,
                };
                // Verifica si ya existe una conversación previa en el contexto
                let primeraVez=false;
                const urlApiCrudChat = `${process.env.apiCrudChat}?sender=${idRecipient}`;
                const responseHistory= await axios.get(urlApiCrudChat);
                const conversation_history_dict = responseHistory.data;
                
                if (conversation_history_dict?.messages.length===0) {
                    primeraVez=true
                    context.conversation_history_dict = [];
                    const messages_init = {
                        role: "system",
                        content: prompt
                    };
                    context.conversation_history_dict.push(messages_init);
                    context.conversation_history_dict.push(reqUser);
                }
                else{
                    conversation_history_dict.messages[0].conversation_history.push(reqUser);                    
                    //console.log(conversation_history_dict.messages[0].conversation_history);
                    context.conversation_history_dict = await conversation_history_dict.messages[0].conversation_history;
                }

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
                reply = OpenAiResponse.choices[0].message.content;
                const responseAssitant = {
                    role: "assistant",
                    content: reply,
                }
                context.conversation_history_dict.push(responseAssitant);                
                //context.log(JSON.stringify(context.conversation_history_dict));
                if (object==='instagram'){
                    context.log('Intentando enviar a instagram...');
                    const responseData = await sendMessageToMessenger(context, idRecipient, reply, message);
                    //context.log(responseData.data);
                }
                ///Guarda conversacion
                if (primeraVez){                    
                    for (const hist of context.conversation_history_dict) {
                        //context.log(hist);
                        await guardarConversacion(process.env.apiCrudChat, hist.role, hist.content, dateTime, idRecipient, object);
                    }
                }else{
                    await guardarConversacion(process.env.apiCrudChat, reqUser.role, reqUser.content, dateTime, idRecipient, object);
                    await guardarConversacion(process.env.apiCrudChat, responseAssitant.role, responseAssitant.content, dateTime, idRecipient, object);
                }
            }else{
                reply = 'No se puede procesar mensaje!';
            }
            context.res = {
                body: reply,
            };
        }else{
            context.res = {                    
                body: 'idRecipient: ' + idRecipient,
            };
        }
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

async function guardarConversacion(url, role, message, dateTime, sender, object){
    const messages_init = {
        role: role,
        message: message,
        date: dateTime,
        sender: sender,
        object: object,
    };
    try {
        const guardar = await axios.post(url, messages_init, { 'Content-Type': 'application/json' });
        //const responseData = guardar.data
        //console.log(JSON.stringify(responseData));
    } catch (error) {
        console.error(error);
    }    
}

async function sendMessageToMessenger(context, idRecipient, message, msgUser) {
    const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
    const LATEST_API_VERSION = "v18.0";
    const afirmativo = await  buscarAfirmacion(msgUser, "si");
    context.log(`afirmacion: ${afirmativo}`);
    const replies = afirmativo ? "\n Ó Desea Hablar Con Un Agente? \n1. Si\n2. No" : "";
    const body = {
        recipient: { id: idRecipient },
        messaging_type: "RESPONSE",
        message: {
            text: message + replies,
            quick_replies: replies!=="" ? [
                {
                  content_type: "text",
                  title: "Si",
                  payload: "1"
                },
                {
                  content_type: "text",
                  title: "No",
                  payload: "2"
                }                
            ] : undefined
        },
    };
    
    const URLInstagram = `https://graph.facebook.com/${LATEST_API_VERSION}/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;    
    //context.log(URLInstagram);    
    context.log(body);
    try {
        const responseData = await axios.post(URLInstagram, body, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return responseData;
    } catch (error) {
        context.error(`Error al enviar mensaje a Messenger: ${error.message}`);
        return null;
    }
}

async function buscarAfirmacion(frase, buscar) {
    try {
      // Convertir toda la frase y la palabra buscada a minúsculas
      const fraseMinusculas = frase.toLowerCase();      
  
      // Crear una expresión regular para buscar la palabra completa
      const expresionRegular = new RegExp(`\\b${buscar}\\b`, 'i');
  
      // Verificar si la palabra está presente en la frase
      const resultado = expresionRegular.test(fraseMinusculas);
  
      return resultado;
    } catch (error) {
      throw new Error('Error en la función buscarPalabraEnFrase: ' + error.message);
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