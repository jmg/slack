package app.talkaroo.mobile;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Before super.onCreate: the bridge builds its plugin registry there,
        // and one declared afterwards does not exist for the web layer.
        registerPlugin(PushConfigPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
