export const TEMPLATE = `
<div
  style="
    border: 1px solid rgb(222, 222, 222);
    box-shadow: rgba(0, 0, 0, 0.06) 0px 1px 3px;
  "
>
  <div class="w __if _lc _sm _od _alsd _alcd _lh14 _xm _xi _ts _dm">
    <div class="wf">
      <div class="wc">
        <div class="e" style="padding-bottom: 100%">
          <div class="em">
            <a
              href="{{{url}}}"
              target="_blank"
              rel="noopener"
              data-do-not-bind-click
              class="c"
              style="
                background-image: url(\'{{{image}}}\');
              "
            ></a>
          </div>
        </div>
      </div>
      <div class="wt">
        <div class="t _f0 _ffsa _fsn _fwn">
          <div class="th _f1p _fsn _fwb">
            <a href="{{{url}}}" target="_blank" rel="noopener" class="thl"
              >{{title}}</a
            >
          </div>
          <div class="td">{{description}}</div>
          <div class="tf _f1m">
            <div class="tc">
              <a href="{{{url}}}" target="_blank" rel="noopener" class="tw _f1m"
                ><span class="twt">{{{url}}}</span
                ><span class="twd">{{{url}}}</span></a
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
`;

export const REGEX = {
	URL: '(http|ftp|https):\\/\\/([\\w_-]+(?:(?:\\.[\\w_-]+)+))([\\w.,@?^=%&:\\/~+#-]*[\\w@?^=%&\\/~+#-])',
};
