const { app } = require('@azure/functions');
const axios = require('axios');

app.http('httpTriggerChatBotAzure', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {        
        if (request.method === 'GET') {
            return handleGetRequest(request, context);
        } else {
            const requestValid = await validPostRequest(request, context);
            //context.log(requestValid);
            if (requestValid?.status===500 || requestValid?.payload==="1" || requestValid?.idRecipient === process.env.serderIdVentaIntagram || requestValid?.idRecipient === process.env.serderIdVentaFacebook) {                
                const respn = {
                    msj:"El bot no respondera...", 
                    body: requestValid?.body
                }
                //context.log(respn);
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
        const object = data.object == 'page' ? 'Facebook' : data.object
        context.log(`Datos de entrada query: ${JSON.stringify(data)}`);
        var message;
        var idRecipient;
        var reply;
        if (object==='whatsapp'){
            message = data?.content;
            idRecipient = data?.idRecipient;
        }
        else{
            idRecipient = data?.entry[0]?.messaging[0]?.sender?.id;
            //console.log(`type: ${JSON.stringify(data?.entry[0]?.messaging[0]?.message?.attachments?.[0]?.type)}`);
            if (data?.entry[0]?.messaging[0]?.message?.attachments?.[0]?.type=='story_mention'){                
                message = process.env.respuestamencion;            }
            else{                
                message = data?.entry[0]?.messaging[0]?.message?.text;
            }
            
            reply = data?.entry[0]?.messaging[0]?.message?.quick_reply?.payload==='1' ? { payload: 'Si'} : data?.entry[0]?.messaging[0]?.message?.quick_reply;
        }
        //console.log(`idrecipiente: ${idRecipient}, message: ${message}, reply: ${reply}`);
        if (idRecipient === process.env.serderIdVentaIntagram){
            return { idRecipient : process.env.serderIdVentaIntagram, body: "idRecipient Invalido", payload: "1" };
        }

        if (idRecipient === process.env.serderIdVentaFacebook){
            return { idRecipient : process.env.serderIdVentaFacebook, body: "idRecipient Invalido", payload: "1" };
        }
        
        if (message!==undefined && message!==''){
            const urlApiCrudChat = `${process.env.apiCrudChat}?senderID=${idRecipient}`;
            
            const responsePendingRespond= await axios.get(urlApiCrudChat);
            const pendingRespond = responsePendingRespond.data;
            
            if (pendingRespond?.length>0) {
                const respond = {
                    quick_reply: [{
                        content_type: "text",
                        title: "Si",
                        payload: "1"
                    }],
                    payload: "1",
                    body: "Pendiente por respuesta del agente humano"
                };
                return respond;
            }        

            const contenido = {
                object: object,
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
        }else{
            return ({error: "No se recibio ningun mensaje que procesar mensaje!", payload: "1"});
        }        
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
    //url facebook
    //https://9ca9ysq2sk.execute-api.us-east-1.amazonaws.com/default/processmessage
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
            const palabrasClaves = ['alfaomega1','alfadelta2', 'alfaomega2'];
            const typesMessages = ['Response', 'WaitingAgentHuman', 'MakePurchase', 'Confirmation'];
            const tiempo = new Date(); //new Date(data.entry[0].time)
            const dateTime = await fotmatedDateTime(tiempo);
            const prompt = process.env.promptVentasInstagram + ' A user could request to speak to a human sales agent. If you detect this request, you must ask for confirmation each time the user requests it and adding as the last question: \
            "Do you want to speak with an agent? 1. Yes 2. No.", list both options for better visualization. Every time the user requests to speak to another agent again, you must ask for \
            that confirmation again, "Do you want to speak with an agent? 1. Yes 2. No.", and each time you ask for that confirmation you must send me the keyword "' + palabrasClaves[2] + '" at the end \
            of that question. The user could press "1" or say "yes" to affirm that they want to speak to an agent or they could press the "2" key to continue speaking with you. \
            If the user presses "1" or "yes", never deny that there is another seller available, write the following sentence: "Perfect, a human sales agent will contact you as soon as possible, \
            see you later. ' + palabrasClaves[0] + '", In case Otherwise, continue with your job of selling him the products in our inventory and/or convincing him. If you manage to convince \
            and/or make a sale to the customer, then request your information: 1. name and surname, 2. the exact address where you want the order to arrive, 3. location on Google Maps, \
            4. telephone number, 5. time available to receive. list them that way so the user can better distinguish the requests. Once these steps are completed and the user provides all this data, \
            tell them that the order would arrive in 1 to 3 days and say goodbye politely and then you must send me the keyword "' + palabrasClaves[1] + '" at the end of the sentence';
           
            var reply = '';
            
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
                "max_tokens": 800,
                "temperature": 0.7,
                "frequency_penalty": 0,
                "presence_penalty": 0,
                "top_p": 0.95,
                "stop": null,
            });
            
            const response = await axios.post(urlServiceOpenaIAAzure, requestBody, { headers });

            const OpenAiResponse = response.data;
            reply = OpenAiResponse.choices[0].message.content;
            console.log(reply);
            const encontroClave = await  buscarPalabraClave(reply, palabrasClaves);
            var typeMsg = typesMessages[0];
            if (encontroClave){
                reply = await eliminarPalabrasClave(reply, palabrasClaves);
                var urlChatUser;
                if (context.object==='instagram'){
                    urlChatUser = `https://www.instagram.com/direct/t/${context.idRecipient}`;
                }else if (context.object==='Facebook'){
                    urlChatUser = `https://www.facebook.com/messages/t/${context.idRecipient}`;
                }
                
                var msj;                
                if (encontroClave==palabrasClaves[0]){ // si se quiere hablar con un agente humano
                    typeMsg = typesMessages[1];
                    msj = urlChatUser!==undefined ? `Un usuario en ${context.object} Quiere Conversar Con Un Agente Humano. Para Ingresar al Chat hacer Click: ${urlChatUser}` : `Un usuario en ${context.object} Quiere Conversar Con Un Agente Humano.`;
                }else if (encontroClave==palabrasClaves[1]){ // si se realizo una compra
                    typeMsg = typesMessages[2];
                    msj = urlChatUser!==undefined ? `Un usuario en ${context.object} Desea Concretar Una Comprar de Uno de Nuestro Productos. Para Ingresar al Chat hacer Click: ${urlChatUser}` : `Un usuario en ${context.object} Desea Concretar Una Comprar de Uno de Nuestro Productos.`;
                }else{
                    typeMsg = typesMessages[3];
                }
                
                console.log(`typeMensaje: ${typeMsg}`);
                
                const bodyNotif = {
                    "object": context.object,
                    "URL": urlChatUser,
                    "message": msj,
                    "subject": typeMsg
                };
                console.log(bodyNotif);
                if (typeMsg === typesMessages[1] || typeMsg === typesMessages[2]){
                    const resp = await axios.post(process.env.urlNotificacionWhatsapp, bodyNotif, { 'Content-Type': 'application/json' });
                }
                //console.log(resp);
            }

            const responseAssitant = {
                role: "assistant",
                content: reply,
            }
            context.conversation_history_dict.push(responseAssitant);            
            
            if (context.object==='instagram'){
                console.log('Intentando enviar a instagram...');                
                const instagramData = await sendMessagerInstagram(context, reply, typeMsg);
                //console.log(instagramData.data);
            }
            if (context.object==='Facebook'){
                console.log('Intentando enviar a facebook...');                
                const facebookData = await sendMessagerFacebook(context, reply, typeMsg);
                //console.log(facebookData.data);
            }
            ///Guarda conversacion
            if (primeraVez){                    
                for (const hist of context.conversation_history_dict) {
                    //context.log(hist);
                    await guardarConversacion(process.env.apiCrudChat, hist.role, hist.content, dateTime, context.idRecipient, context.object);
                }
            }else{
                await guardarConversacion(process.env.apiCrudChat, reqUser.role, reqUser.content, dateTime, context.idRecipient, context.object);                    
                if (encontroClave==palabrasClaves[0]){
                    
                    const bodyUserPending = { "sender": `${context.idRecipient}`, "waiting": 1 };
                    console.log(bodyUserPending);
                    const responseUserPending= await axios.post(process.env.apiCrudChat, bodyUserPending);
                    console.log(responseUserPending.data);
                }
                await guardarConversacion(process.env.apiCrudChat, responseAssitant.role, responseAssitant.content, dateTime, context.idRecipient, context.object);
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

async function sendMessagerFacebook(context, reply, typeMsg) {
    const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN_facebook;
    const LATEST_API_VERSION = "v18.0";
    const body = {
        recipient: { id: context.idRecipient },
        message: {
            text: reply,
            quick_replies: typeMsg === "Confirmation" ? [
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
        }
    };
    
    const URLfacebook = `https://graph.facebook.com/${LATEST_API_VERSION}/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;    
    
    try {
        const responseData = await axios.post(URLfacebook, body, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return responseData;
    } catch (error) {
        console.error(`Error al enviar mensaje a Facebook: ${error.message}`);
        return null;
    }
}

async function sendMessagerInstagram(context, reply, typeMsg) {
    const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN_instagram;
    const LATEST_API_VERSION = "v18.0";
    
    const body = {
        recipient: { id: context.idRecipient },
        messaging_type: "RESPONSE",
        message: {
            text: reply,
            quick_replies: typeMsg === "Confirmation" ? [
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

async function buscarPalabraClave(frase, palabrasClaves) {
    try {
      // Convertir toda la frase a minúsculas
      const fraseMinusculas = frase.toLowerCase();
  
      // Lista de palabras a buscar
      const palabrasBuscar = palabrasClaves;
  
      // Verificar si alguna de las palabras está presente en la frase
      const resultado = palabrasBuscar.find(palabra => {        
        const expresionRegular = new RegExp(`\\b${palabra}\\b`, 'i');
        return expresionRegular.test(fraseMinusculas);
      });
      
      return resultado || false;
    } catch (error) {
      throw new Error('Error en la función buscarPalabraClave: ' + error.message);
    }
}

async function eliminarPalabrasClave(frase, palabrasClaves) {
  try {
    // Convertir toda la frase a minúsculas
    const fraseMinusculas = frase.toLowerCase();

    // Lista de palabras a buscar
    const palabrasBuscar = palabrasClaves;

    // Eliminar las palabras clave de la frase
    const fraseSinPalabras = palabrasBuscar.reduce((fraseActual, palabra) => {
      const expresionRegular = new RegExp(`\\b${palabra}\\b`, 'gi');
      return fraseActual.replace(expresionRegular, '');
    }, fraseMinusculas);
    
    return fraseSinPalabras;
  } catch (error) {
    throw new Error('Error en la función eliminarPalabrasClave: ' + error.message);
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