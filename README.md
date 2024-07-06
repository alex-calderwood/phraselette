# Prism Editor

A text editor for viewing your text in many different ways...

# Start the Front End

    cd front-end/expand-editor/
    npm start

## Reminder on how to set up node

To use a specific node version

    nvm use 16
    npm install yarn
    yarn add react react-dom


# Start the backend

I recommend you create a new python environment because this uses transformers, tensorflow, and spacy. Requires Python 3.10.

    cd front-end
    pip install -r requirements.txt
    python -m spacy download en_core_web_sm
    export FLASK_APP="server.py"
    
    flask run


# To Do's 

* Rename front-end/expand-editor/ directory
