from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from models import db, Task, Category
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Use env vars
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['STATIC_FOLDER'] = 'static'

db.init_app(app)

with app.app_context():
    db.create_all()

# ---- Routes for pages ----
@app.route("/")
def dashboard():
    return render_template("index.html")

@app.route("/todo")
def todo():
    return render_template("todo.html")

@app.route("/calendar")
def calendar():
    return render_template("calendar.html")

@app.route("/graph")
def graph():
    return render_template("graph.html")


# ---- API Routes ----
@app.route("/api/categories", methods=["GET", "POST"])
def categories():
    if request.method == "GET":
        all_categories = Category.query.all()
        return jsonify([{"id": cat.id, "name": cat.name} for cat in all_categories])

    data = request.json
    name = data.get("name")
    if not name:
        return jsonify({"error": "Category name is required"}), 400
    if Category.query.filter_by(name=name).first():
        return jsonify({"error": "Category already exists"}), 400

    new_cat = Category(name=name)
    db.session.add(new_cat)
    db.session.commit()
    return jsonify({"id": new_cat.id, "name": new_cat.name}), 201


@app.route("/api/categories/<int:category_id>", methods=["PATCH", "DELETE"])
def modify_category(category_id):
    category = Category.query.get_or_404(category_id)

    if request.method == "PATCH":
        data = request.json
        new_name = data.get("name")
        if new_name:
            category.name = new_name
            db.session.commit()
            return jsonify({"message": "Category updated"})

    elif request.method == "DELETE":
        db.session.delete(category)
        db.session.commit()
        return jsonify({"message": "Category deleted"})


@app.route("/api/tasks", methods=["GET", "POST"])
def tasks():
    if request.method == "GET":
        all_tasks = Task.query.all()
        return jsonify([
            {
                "id": task.id,
                "title": task.title,
                "categoryId": task.category_id,
                "categoryName": task.category.name,
                "completed": task.completed,
                "dueDate": task.due_date
            }
            for task in all_tasks
        ])

    data = request.json
    new_task = Task(
        title=data["title"],
        category_id=data["categoryId"],
        due_date=data.get("dueDate")
    )
    db.session.add(new_task)
    db.session.commit()
    return jsonify({"id": new_task.id}), 201


@app.route("/api/tasks/<int:task_id>", methods=["PATCH", "DELETE"])
def modify_task(task_id):
    task = Task.query.get_or_404(task_id)

    if request.method == "PATCH":
        data = request.json
        if "title" in data:
            task.title = data["title"]
        if "completed" in data:
            task.completed = data["completed"]
        if "dueDate" in data:
            task.due_date = data["dueDate"]
        db.session.commit()
        return jsonify({"message": "Task updated"})

    elif request.method == "DELETE":
        db.session.delete(task)
        db.session.commit()
        return jsonify({"message": "Task deleted"})


if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=10000)
