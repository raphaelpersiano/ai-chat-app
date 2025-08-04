        const expectedSignature = crypto
            .createHmac('sha256', this.appSecret)
            .update(payload, 'utf8')
            .digest('hex');

        const receivedSignature = signature.replace('sha256=', '');
        return crypto.timingSafeEqual(
            Buffer.from(expectedSignature, 'hex'),
            Buffer.from(receivedSignature, 'hex')
        );
    }

    /**