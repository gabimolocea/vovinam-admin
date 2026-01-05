"""
Login dialog for API authentication
"""
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, 
    QLineEdit, QPushButton, QMessageBox, QFormLayout, QCheckBox
)
from PyQt6.QtCore import Qt, QSettings
import requests
import config

class LoginDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.token = None
        self.user_info = None
        self.settings = QSettings('FRVV', 'DesktopApp')
        self.init_ui()
        self.load_saved_credentials()
    
    def init_ui(self):
        """Initialize the dialog"""
        self.setWindowTitle('Login to FRVV API')
        self.setFixedSize(400, 200)
        
        layout = QVBoxLayout(self)
        
        # Form
        form = QFormLayout()
        
        self.email_input = QLineEdit()
        self.email_input.setPlaceholderText('admin@example.com')
        form.addRow('Email:', self.email_input)
        
        self.password_input = QLineEdit()
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_input.setPlaceholderText('Password')
        form.addRow('Password:', self.password_input)
        
        self.remember_me = QCheckBox('Remember me')
        form.addRow('', self.remember_me)
        
        layout.addLayout(form)
        
        # API URL info
        url_label = QLabel(f'API: {config.API_BASE_URL}')
        url_label.setStyleSheet('color: gray; font-size: 10px;')
        layout.addWidget(url_label)
        
        layout.addStretch()
        
        # Buttons
        button_layout = QHBoxLayout()
        
        btn_login = QPushButton('Login')
        btn_login.setDefault(True)
        btn_login.clicked.connect(self.do_login)
        button_layout.addWidget(btn_login)
        
        btn_cancel = QPushButton('Cancel')
        btn_cancel.clicked.connect(self.reject)
        button_layout.addWidget(btn_cancel)
        
        layout.addLayout(button_layout)
        
        # Connect enter key
        self.password_input.returnPressed.connect(self.do_login)
    
    def do_login(self):
        """Attempt to login"""
        email = self.email_input.text().strip()
        password = self.password_input.text()
        
        if not email or not password:
            QMessageBox.warning(self, 'Login', 'Please enter email and password')
            return
        
        try:
            # Try to login and get JWT token
            response = requests.post(
                f"{config.API_BASE_URL}/auth/login/",
                json={'email': email, 'password': password},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                # Token is nested under 'tokens' -> 'access'
                tokens = data.get('tokens', {})
                self.token = tokens.get('access')
                self.user_info = data.get('user', {})
                
                if self.token:
                    QMessageBox.information(
                        self, 'Login Success', 
                        f"Welcome, {self.user_info.get('first_name', 'User')}!"
                    )
                    self.accept()
                else:
                    QMessageBox.warning(self, 'Login Failed', 'No token received from server')
            else:
                try:
                    error_data = response.json()
                    error_msg = error_data.get('detail') or error_data.get('non_field_errors', ['Invalid credentials'])[0]
                except:
                    error_msg = f'Login failed with status {response.status_code}'
                QMessageBox.warning(self, 'Login Failed', error_msg)
                
        except requests.exceptions.ConnectionError:
            QMessageBox.critical(
                self, 'Connection Error',
                f'Cannot connect to API at:\n{config.API_BASE_URL}\n\n'
                'Please ensure the backend server is running.'
            )
        except Exception as e:
            QMessageBox.critical(self, 'Login Error', f'Error: {str(e)}')
    
    def get_token(self):
        """Get the authentication token"""
        return self.token
    
    def get_user_info(self):
        """Get user information"""
        return self.user_info
    
    def load_saved_credentials(self):
        """Load saved credentials if remember me was checked"""
        if self.settings.value('remember_me', False, type=bool):
            email = self.settings.value('email', '')
            password = self.settings.value('password', '')
            if email and password:
                self.email_input.setText(email)
                self.password_input.setText(password)
                self.remember_me.setChecked(True)
