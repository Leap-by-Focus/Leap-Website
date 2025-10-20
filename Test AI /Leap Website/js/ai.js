
        document.getElementById('sendMessage').addEventListener('click', function() {
            let userInput = document.getElementById('userInput').value;
            let imageFile = document.getElementById('imageUpload').files[0];

            const messageBox = document.getElementById('messageBox');

            // Überprüfen, ob der Benutzer Text eingegeben hat oder ein Bild hochgeladen wurde
            if (userInput || imageFile) {
                let userMessage = `<div class="message user-message">${userInput ? userInput : ''}</div>`;
                if (imageFile) {
                    const imageUrl = URL.createObjectURL(imageFile); // Temporäre URL für das Bild
                    userMessage += `<div class="message image-message"><img src="${imageUrl}" alt="Uploaded Image" class="uploaded-image" /></div>`;
                }

                messageBox.innerHTML += userMessage;
                document.getElementById('userInput').value = '';
                document.getElementById('imageUpload').value = ''; // Bild-Upload zurücksetzen

                // Simulierte AI-Antwort (im echten Fall hier API-Call für die Antwort)
                setTimeout(function() {
                    messageBox.innerHTML += `<div class="message ai-message">Antwort von Leap AI: "${userInput}"</div>`;
                    messageBox.scrollTop = messageBox.scrollHeight;
                }, 1000);
            }
        });