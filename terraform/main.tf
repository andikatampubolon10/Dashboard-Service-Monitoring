terraform {
  required_version = ">= 1.5.0"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {}

variable "environment" {
  description = "Deployment environment used to isolate Docker networks."
  type        = string

  validation {
    condition     = contains(["development", "production"], var.environment)
    error_message = "environment must be development or production."
  }
}

variable "project_name" {
  description = "Prefix used for Docker resources."
  type        = string
  default     = "dashboard-service"
}

resource "docker_network" "application" {
  name = "${var.project_name}-${var.environment}"

  labels {
    label = "managed-by"
    value = "terraform"
  }

  labels {
    label = "environment"
    value = var.environment
  }
}

output "network_name" {
  value = docker_network.application.name
}
