const { Server } = require("socket.io");
const cookie = require("cookie")
const jwt = require("jsonwebtoken")
const userModel = require("../models/user.model")
const aiService = require("../services/ai.service");
const messageModel = require("../models/message.model")
const { createMemory, queryMemory } = require("../services/vector.service");


function initSocketServer(httpServer) {

    const io = new Server(httpServer, {})

    // io.use it is socket.io middleware
    io.use(async (socket, next) => {

        const cookies = cookie.parse(socket.handshake.headers?.cookie || "");

        if (!cookies.token) {
            next(new Error("Authentication error:No token provided"));
        }

        try {
            const decoded = jwt.verify(cookies.token, process.env.JWT_SECRET);
            const user = await userModel.findById(decoded.id);
            socket.user = user
            next()

        } catch (error) {
            next(new Error("Authentication error:No token provided"));
        }
        console.log("socket connection cookies:", cookies);
    })

    io.on("connection", (socket) => {
        // console.log("new socket connection :", socket.id);
        // console.log("User connected:",socket.user)

        socket.on("ai-message", async (messagePayload) => {
            console.log(messagePayload)

            /* 
             const message = await messageModel.create({
                 chat: messagePayload.chat,
                 user: socket.user._id,
                 content: messagePayload.content,
                 role: "user"
             })
 
             const vectors = await aiService.generateVectors(messagePayload.content)
           */

            //optimized version now both will run parallely
            const [message, vectors] = await Promise.all([
                messageModel.create({
                    chat: messagePayload.chat,
                    user: socket.user._id,
                    content: messagePayload.content,
                    role: "user"
                }),
                aiService.generateVectors(messagePayload.content),
                // createMemory({
                //     vectors,
                //     messageId: message._id,
                //     metadata: {
                //         chat: messagePayload.chat,
                //         user: socket.user._id,
                //         text: messagePayload.content
                //     }
                // })
            ])

            await createMemory({
                    vectors,
                    messageId: message._id,
                    metadata: {
                        chat: messagePayload.chat,
                        user: socket.user._id,
                        text: messagePayload.content
                    }
                })

            //optimized version of creating memory in db and generating vectors in parallel

            const [memory, chatHistoryData = []] = await Promise.all([

                queryMemory({
                    queryVector: vectors,
                    limit: 2,
                    metadata: {
                         user: socket.user._id
                    }
                }),
                messageModel.find({
                    chat: messagePayload.chat
                }).sort({ createdAt: -1 }).limit(20).lean()
            ])

            const chatHistory = chatHistoryData.reverse();


            // const memory = await queryMemory({
            //     queryVector: vectors,
            //     limit: 2,
            //     metadata: {
            //         // user: socket.user._id
            //     }
            // })

            // console.log(memory);

            /* await createMemory({
                 vectors,
                 messageId: message._id,
                 metadata: {
                     chat: messagePayload.chat,
                     user: socket.user._id,
                     text: messagePayload.content
                 }
             }) */

            // const chatHistory =await messageModel.find({
            //     chat:messagePayload.chat
            // })

            //limitations of chat history of short time
            // const chatHistory = (await messageModel.find({
            //     chat: messagePayload.chat
            // }).sort({ createdAt: -1 }).limit(20).lean()).reverse()

            // console.log("chat history", chatHistory);


            const stm = chatHistory.map(item => {
                return {
                    role: item.role,
                    parts: [{ text: item.content }]
                }
            })

            const ltm = [
                {
                    role: "user",
                    parts: [{
                        text: `

                        these are some previous messages from the chat, use them to generate a response

                        ${memory.map(item => item.metadata.text).join("\n")}
                        
                        ` }]
                }
            ]

            console.log(ltm[0])
            console.log(stm)




            //this was old way of using only stm short term memory

            // const response = await aiService.generateResponse(chatHistory.map(item => {
            //     return {
            //         role: item.role,
            //         parts: [{ text: item.content }]
            //     }
            // }))


            // this is new with stm ltm long term memory RAG concept

            const response = await aiService.generateResponse([...ltm, ...stm])

            // const responseMessage = await messageModel.create({
            //     chat: messagePayload.chat,
            //     user: socket.user._id,
            //     content: response,
            //     role: "model"
            // })

            // const responseVectors = await aiService.generateVectors(response);

            socket.emit('ai-response', {
                content: response,
                chat: messagePayload.chat
            })

            //optimizing  the save respnse (responseMessage,responseVectors) memory and generating vectors parallely

            const [responseMessage, responseVectors,] = await Promise.all([
                messageModel.create({
                    chat: messagePayload.chat,
                    user: socket.user._id,
                    content: response,
                    role: "model"
                }),
                aiService.generateVectors(response)
            ])

            await createMemory({
                vectors: responseVectors,
                messageId: responseMessage._id,
                metadata: {
                    chat: messagePayload.chat,
                    user: socket.user._id,
                    text: response
                }
            })

            // socket.emit('ai-response', {
            //     content: response,
            //     chat: messagePayload.chat
            // })
        })

    })
}

module.exports = initSocketServer;