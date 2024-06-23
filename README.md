# Prism Editor

A text editor for viewing your text in many different ways...

# Start the backend

I recommend you create a new python environment because this uses transformers, tensorflow, and spacy. Make sure you are using Python 3.10.

    cd front-end
    pip install -r requirements.txt
    python -m spacy download en_core_web_sm
    export FLASK_APP="server.py"
    flask run

# Start the Front End

    cd front-end/expand-editor/
    npm start

## Set up node and install slate editor

To use a specific node version

    nvm use 16
    npm install yarn
    yarn add react react-dom

# To Do's 

* Rename front-end/expand-editor/ directory
