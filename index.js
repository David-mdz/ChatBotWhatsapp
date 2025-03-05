const wppconnect = require('@wppconnect-team/wppconnect');
const mysql = require('mysql2/promise');
const moment = require('moment');

// Conexión a la base de datos
const createConnection = async () => {
    return await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '422542',
        database: 'medcall'
    });
};

// Formatear fecha
const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

// Configurar y crear cliente de WhatsApp
const setupWhatsAppClient = async () => {
    try {
        const client = await wppconnect.create({
            session: 'chatbot',
            catchQR: (qrCode, asciiQR) => {
                console.log('Escanea este código QR para conectarte:');
                console.log(asciiQR); // Muestra el QR en formato ASCII en la terminal
            },
            browserOptions: {
                headless: false, 
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            }
        });
        console.log('Cliente de WhatsApp configurado.');
        return client;
    } catch (error) {
        console.error('Error configurando el cliente de WhatsApp:', error);
        throw error;
    }
};

// Función para notificar a los pacientes
const notifyPatients = async (client) => {
    const connection = await createConnection();

    try {
        // Obtener la fecha y hora actual
        const now = moment().startOf('minute'); // Redondear a minuto más cercano
        const thirtyMinutesLater = now.clone().add(30, 'minutes');

        const formattedNow = now.format('YYYY-MM-DD HH:mm:ss');
        const formattedThirtyMinutesLater = thirtyMinutesLater.format('YYYY-MM-DD HH:mm:ss');

        console.log(`Rango de búsqueda: ${formattedNow} - ${formattedThirtyMinutesLater}`);

        // Consultar turnos que comienzan en los próximos 30 minutos y que no hayan sido notificados
        const [rows] = await connection.execute(
            `SELECT * FROM turnos 
             WHERE CONCAT(fecha, ' ', horario) BETWEEN ? AND ? 
             AND notificado = 0`, // Verifica que no se haya notificado
            [formattedNow, formattedThirtyMinutesLater]
        );

        console.log(`Cantidad de turnos encontrados: ${rows.length}`);

        for (const row of rows) {
            const { paciente, dni, especialidad, telefono, horario, fecha, id } = row;
            const formattedDate = formatDate(new Date(fecha));
            const formattedTime = moment(horario, 'HH:mm:ss').format('HH:mm'); // Formatear la hora sin segundos
            const message = `Hola, ${paciente} DNI ${dni}, te recordamos que el día ${formattedDate} tenés turno para ${especialidad} a las ${formattedTime}`;

            // Transformar el número de teléfono a formato internacional para WhatsApp
            const formattedPhoneNumber = `549${telefono.replace(/^0/, '')}@c.us`;
            console.log(`Enviando mensaje a ${formattedPhoneNumber}`);
            console.log(`Mensaje: ${message}`);

            try {
                const result = await client.sendText(formattedPhoneNumber, message);
                console.log(`Mensaje enviado a ${paciente}:`, result);

                // Actualizar el campo 'notificado' a 1 para marcar que el mensaje fue enviado
                await connection.execute(
                    `UPDATE turnos SET notificado = 1 WHERE id = ?`,
                    [id]
                );
            } catch (error) {
                console.error(`Error al enviar mensaje a ${paciente}:`, error);
            }
        }
    } catch (error) {
        console.error('Error en la notificación:', error);
    } finally {
        await connection.end();
    }
};

// Ejecutar la función de notificación cada minuto
const startNotificationService = async () => {
    console.log('Servicio de notificaciones iniciado.');
    const client = await setupWhatsAppClient(); // Configurar cliente de WhatsApp
    notifyPatients(client); // Ejecutar inmediatamente para verificar turnos en el inicio
    setInterval(() => notifyPatients(client), 60000); // 60000 ms = 1 minuto
};

// Ejecutar el servicio
startNotificationService();
