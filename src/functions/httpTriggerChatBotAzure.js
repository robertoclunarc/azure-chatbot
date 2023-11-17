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
            const requestValid = await validPostRequest(request, context);
            context.log(requestValid);
            if ((requestValid?.quick_reply && requestValid?.payload==='1') || requestValid?.idRecipient === process.env.serderIdVentaIntagram) {
                
                context.log("Quick reply detectado, realizar acción correspondiente...");
                return
            } else {
                return handlePostRequest(requestValid);
            }
            
        }
    }
});

async function validPostRequest(request, context) {
    try {
        
        const req = await request.text();
        const data = JSON.parse(req);        
        const object = data.object;
        context.log(`Datos de entrada query: ${JSON.stringify(data)}`);
        var message;
        var idRecipient;
        if (object==='whatsapp'){
            message = data?.content;
            idRecipient = data?.idRecipient;
        }
        else{
            idRecipient = data?.entry[0]?.messaging[0]?.sender?.id;
            message = data?.entry[0]?.messaging[0]?.message?.text;
        }

        if (idRecipient === process.env.serderIdVentaIntagram){
            return { idRecipient : process.env.serderIdVentaIntagram }
        }

        const reply = data?.entry[0]?.messaging[0]?.message?.quick_reply;

        const contenido = {
            object: data.object,
            idRecipient: idRecipient,
            message: message,
            quick_reply: reply,
            payload: reply?.payload,
            conversation_history_dict: [],
            res:{                    
                body: 'idRecipient: ' + idRecipient,
            },
        }
        
        return contenido;
    } catch (error) {
        context.error(`Error en el servicio validPostRequest: ${error}`);
        context.res = {
            status: 500,
            body: 'Error en el servicio: ' + error.message,
        };
        return context.res;
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

async function handlePostRequest(contenido) {
    var context = await contenido;
    try {
        //////valida que no se ejecute dos veces el bot
        //if (idRecipient !== process.env.serderIdVentaIntagram){
            
            const tiempo = new Date(); //new Date(data.entry[0].time)
            const dateTime = await fotmatedDateTime(tiempo);
            const prompt = process.env.promptVentasInstagram;
           
            var reply = '';
            if (context.message!==undefined && context.message!==''){
                const reqUser = {
                    role: "user",
                    content: context.message,
                };
                
                let primeraVez=false;
                const urlApiCrudChat = `${process.env.apiCrudChat}?sender=${context.idRecipient}`;
                //console.log(urlApiCrudChat);
                const responseHistory= await axios.get(urlApiCrudChat);
                const conversation_history_dict = responseHistory.data;
                
                if (conversation_history_dict?.messages.length===0) {
                    primeraVez=true
                    //context.conversation_history_dict = [];
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
                //console.log(requestBody);
                const response = await axios.post(urlServiceOpenaIAAzure, requestBody, { headers });

                const OpenAiResponse = response.data;
                reply = OpenAiResponse.choices[0].message.content;
                const responseAssitant = {
                    role: "assistant",
                    content: reply,
                }
                context.conversation_history_dict.push(responseAssitant);                
                //console.log(JSON.stringify(context.conversation_history_dict));
                if (context.object==='instagram'){
                    console.log('Intentando enviar a instagram...');
                    //const responseData = await sendMessageToMessenger(context, context.idRecipient, reply, context.message);
                    const responseData = await sendMessageToMessenger(context, reply);
                    //console.log(responseData.data);
                }
                ///Guarda conversacion
                if (primeraVez){                    
                    for (const hist of context.conversation_history_dict) {
                        //context.log(hist);
                        await guardarConversacion(process.env.apiCrudChat, hist.role, hist.content, dateTime, context.idRecipient, context.object);
                    }
                }else{
                    await guardarConversacion(process.env.apiCrudChat, reqUser.role, reqUser.content, dateTime, context.idRecipient, context.object);
                    await guardarConversacion(process.env.apiCrudChat, responseAssitant.role, responseAssitant.content, dateTime, context.idRecipient, context.object);
                }
            }else{
                reply = 'No se puede procesar mensaje!';
            }
            context.res = {
                body: reply,
            };
        /*}else{
            context.res = {                    
                body: 'idRecipient: ' + idRecipient,
            };
        }*/
        return context.res;
    } catch (error) {
        console.error(`Error en el servicio handlePostRequest:  ${error}`);
        console.error(`Detalle Error:  ${error.message}`);
        console.res = {
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

async function sendMessageToMessenger(context,reply) {
    const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
    const LATEST_API_VERSION = "v18.0";
    const afirmativo = await  buscarAfirmacion(context.message, "si");
    console.log(`afirmacion: ${afirmativo}`);
    const replies = afirmativo ? "\n Ó Desea Hablar Con Un Agente? \n1. Si\n2. No" : "";
    const body = {
        recipient: { id: context.idRecipient },
        messaging_type: "RESPONSE",
        message: {
            text: reply + replies,
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
    //console.log(URLInstagram);    
    //console.log(body);
    try {
        const responseData = await axios.post(URLInstagram, body, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return responseData;
    } catch (error) {
        console.error(`Error al enviar mensaje a Messenger: ${error.message}`);
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