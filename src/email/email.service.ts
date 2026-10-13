import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailProps {
  to: string;
  from?: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    // Explicit SMTP (not `service: 'gmail'`). Production hosts often hang on
    // Gmail's IPv6 address until the browser aborts the invitation request.
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      family: 4,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      auth: {
        user: this.configService.get('mail.user'),
        pass: this.configService.get('mail.pass'),
      },
    });
  }

  async sendMail(props: SendMailProps): Promise<void> {
    const { to, from, subject, html } = props;

    const mailOptions = {
      from: from || this.configService.get('mail.defaultFrom'),
      to,
      subject,
      html,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to ${to}`);
    } catch (error) {
      console.error('Error sending email:', error);
      //@ts-ignore
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}
