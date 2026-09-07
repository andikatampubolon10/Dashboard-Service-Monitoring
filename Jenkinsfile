pipeline {
	agent { label 'Jenkins' }

	options {
		disableConcurrentBuilds()
		timestamps()
		buildDiscarder(logRotator(numToKeepStr: '10'))
	}

	triggers {
		githubPush()
	}

	environment {
		TF_IN_AUTOMATION = 'true'
		TF_INPUT = 'false'
		COMPOSE_PROJECT_NAME = 'dashboard-service'
	}

	stages {
		stage('Checkout') {
			steps {
				checkout scm
			}
		}

		stage('Terraform Init and Validate') {
			steps {
				dir('terraform') {
					bat 'terraform init -input=false'
					bat 'terraform validate'
				}
			}
		}

		stage('Plan Production') {
			steps {
				dir('terraform') {
					bat '''
						terraform workspace select production || terraform workspace new production
						terraform plan -input=false -var="environment=production" -out=production.tfplan
					'''
					archiveArtifacts artifacts: 'production.tfplan', fingerprint: true
				}
			}
		}

		stage('Deploy Development') {
			steps {
				bat '''
					docker compose -f docker/docker-compose.dev.yml config
					docker compose -f docker/docker-compose.dev.yml build
				'''
				dir('terraform') {
					bat '''
						terraform workspace select development || terraform workspace new development
						terraform apply -input=false -auto-approve -var="environment=development"
					'''
				}
				bat 'docker compose -f docker/docker-compose.dev.yml up -d'
			}
		}

		stage('Approve Production') {
			options {
				timeout(time: 30, unit: 'MINUTES')
			}
			steps {
				input message: 'Upload perubahan ke production?', ok: 'Deploy ke Production'
			}
		}

		stage('Deploy Production') {
			steps {
				dir('terraform') {
					bat '''
						terraform workspace select production
						terraform apply -input=false production.tfplan
					'''
				}
				bat '''
					docker compose -f docker/docker-compose.prod.yml config
					docker compose -f docker/docker-compose.prod.yml build
					docker compose -f docker/docker-compose.prod.yml up -d
				'''
			}
		}
	}

	post {
		always {
			bat 'docker image prune -f || exit /b 0'
		}
	}
}
