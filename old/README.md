# Phrasematic

A text editor for viewing your text in many different ways...

# Start the Back End

I recommend you create a new python environment because this uses transformers, tensorflow, and spacy. Requires Python 3.10.

    cd back-end
    pip install -r requirements.txt
    python -m spacy download en_core_web_sm
    export FLASK_APP="server.py"
    flask run --host 0.0.0.0 --port 5025

# Start the Front End

You will need a credential.json (move `credential.json` into `front-end/`)

    nvm use 22.2.0 
    cd front-end/
    npm start


# ngrok

to start both on the remote server, first start each in a different bash instance

ngrok start --all
